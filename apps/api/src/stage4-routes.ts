import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { Prisma, UserRole, evaluateProductionGate, type PrismaClient } from '@sales-ai/database';
import { normalizePhoneNumber } from '@sales-ai/shared/stage2';
import {
  allowlistSchema,
  gateInputSchema,
  mockWebhookSchema,
  providerConfigSchema,
  reasonSchema,
  stopSchema,
} from '@sales-ai/validation';
import { requestMetadata, writeAudit } from './audit.js';
import { registerApprovalRoutes } from './modules/production-safety/approval/approval.routes.js';
import { registerProductionPolicyRoutes } from './modules/production-safety/policy/production-policy.routes.js';
import { registerReadinessRoutes } from './modules/production-safety/readiness/readiness.routes.js';
import { enqueueOutbox } from './outbox.js';
import type { AuthContext } from './types.js';

type Deps = {
  prisma: PrismaClient;
  webhookSecret: string;
  redisUrl: string;
  authenticate(request: FastifyRequest, reply: FastifyReply): Promise<AuthContext | undefined>;
  authorize(
    request: FastifyRequest,
    reply: FastifyReply,
    roles: readonly UserRole[],
  ): Promise<AuthContext | undefined>;
  verifyCsrf(request: FastifyRequest, reply: FastifyReply, auth: AuthContext): boolean;
  error(reply: FastifyReply, code: number, key: string, message: string): unknown;
};

export function registerStage4Routes(app: FastifyInstance, deps: Deps) {
  const { prisma } = deps;
  const org = (auth: AuthContext, requested?: string) =>
    auth.role === UserRole.system_admin && requested ? requested : auth.organizationId;
  async function mutate(request: FastifyRequest, reply: FastifyReply, roles: UserRole[]) {
    const auth = await deps.authorize(request, reply, roles);
    if (!auth || !deps.verifyCsrf(request, reply, auth)) return;
    return auth;
  }
  const audit = (
    request: FastifyRequest,
    auth: AuthContext,
    organizationId: string,
    action: string,
    type: string,
    id: string,
    afterData?: unknown,
    beforeData?: unknown,
  ) =>
    writeAudit(prisma, {
      organizationId,
      userId: auth.userId,
      action,
      entityType: type,
      entityId: id,
      afterData,
      beforeData,
      ...requestMetadata(request),
    });

  registerReadinessRoutes(app, deps);
  registerApprovalRoutes(app, deps);
  registerProductionPolicyRoutes(app, deps);
  app.get('/api/v1/emergency-stops', async (request, reply) => {
    const auth = await deps.authorize(request, reply, [
      UserRole.system_admin,
      UserRole.admin,
      UserRole.manager,
    ]);
    if (!auth) return;
    return {
      stops: await prisma.emergencyStop.findMany({
        where:
          auth.role === UserRole.system_admin
            ? {}
            : { OR: [{ scope: 'system' }, { organizationId: auth.organizationId }] },
        orderBy: { activatedAt: 'desc' },
      }),
    };
  });
  app.post('/api/v1/emergency-stops', async (request, reply) => {
    const auth = await mutate(request, reply, [UserRole.system_admin, UserRole.admin]);
    if (!auth) return;
    const parsed = stopSchema.safeParse(request.body);
    if (!parsed.success) return deps.error(reply, 400, 'VALIDATION_ERROR', parsed.error.message);
    if (parsed.data.scope === 'system' && auth.role !== UserRole.system_admin)
      return deps.error(reply, 403, 'FORBIDDEN', 'システム停止はシステム管理者のみ実行できます');
    const organizationId =
      parsed.data.scope === 'system' ? null : org(auth, parsed.data.organizationId);
    const stop = await prisma.$transaction(async (tx) => {
      const created = await tx.emergencyStop.create({
        data: {
          organizationId,
          scope: parsed.data.scope,
          scopeId: parsed.data.scopeId ?? null,
          reason: parsed.data.reason,
          activatedBy: auth.userId,
        },
      });
      await tx.callJob.updateMany({
        where: {
          ...(organizationId ? { organizationId } : {}),
          status: { in: ['queued', 'reserved', 'dispatching'] },
        },
        data: {
          status: 'skipped',
          errorCode: 'emergency_stop',
          errorMessage: 'Stage 4A safety stop',
        },
      });
      await enqueueOutbox(tx, {
        organizationId,
        eventType: 'twilio-emergency-stop',
        aggregateType: 'emergency_stop',
        aggregateId: created.id,
        payload: {
          organizationId,
          scope: created.scope,
          scopeId: created.scopeId,
          emergencyStopId: created.id,
        },
      });
      return created;
    });
    await audit(
      request,
      auth,
      organizationId ?? auth.organizationId,
      'emergency_stop.activated',
      'emergency_stop',
      stop.id,
      { scope: stop.scope, scopeId: stop.scopeId, reason: stop.reason },
    );
    return reply.code(201).send({ stop });
  });
  app.post('/api/v1/emergency-stops/:id/release', async (request, reply) => {
    const auth = await mutate(request, reply, [UserRole.system_admin]);
    if (!auth) return;
    const parsed = reasonSchema.safeParse(request.body);
    if (!parsed.success) return deps.error(reply, 400, 'REASON_REQUIRED', '解除理由が必要です');
    const id = (request.params as { id: string }).id;
    const before = await prisma.emergencyStop.findUnique({ where: { id } });
    if (!before?.active) return deps.error(reply, 404, 'NOT_FOUND', '有効な停止がありません');
    const stop = await prisma.emergencyStop.update({
      where: { id },
      data: {
        active: false,
        releasedBy: auth.userId,
        releasedAt: new Date(),
        releaseReason: parsed.data.reason,
      },
    });
    await audit(
      request,
      auth,
      before.organizationId ?? auth.organizationId,
      'emergency_stop.released',
      'emergency_stop',
      id,
      { reason: parsed.data.reason },
    );
    return { stop };
  });

  app.get('/api/v1/test-call-allowlist', async (request, reply) => {
    const auth = await deps.authorize(request, reply, [
      UserRole.system_admin,
      UserRole.admin,
      UserRole.manager,
    ]);
    if (!auth) return;
    const q = request.query as { organizationId?: string };
    const rows = await prisma.testCallAllowlist.findMany({
      where: { organizationId: org(auth, q.organizationId) },
      orderBy: { createdAt: 'desc' },
    });
    return {
      allowlist: rows.map(({ normalizedPhoneNumber, ...row }) => ({
        ...row,
        maskedPhone: `********${normalizedPhoneNumber.slice(-4)}`,
      })),
    };
  });
  app.post('/api/v1/test-call-allowlist', async (request, reply) => {
    const auth = await mutate(request, reply, [UserRole.system_admin, UserRole.admin]);
    if (!auth) return;
    const parsed = allowlistSchema.safeParse(request.body);
    if (!parsed.success) return deps.error(reply, 400, 'VALIDATION_ERROR', parsed.error.message);
    const organizationId = org(auth, parsed.data.organizationId);
    const normalized = normalizePhoneNumber(parsed.data.phoneNumber);
    if (!normalized.isValid) return deps.error(reply, 400, 'INVALID_PHONE', '電話番号が不正です');
    const row = await prisma.testCallAllowlist.upsert({
      where: {
        organizationId_normalizedPhoneNumber: {
          organizationId,
          normalizedPhoneNumber: normalized.normalizedNumber,
        },
      },
      update: {
        region: parsed.data.region,
        ownerName: parsed.data.ownerName,
        purpose: parsed.data.purpose,
        consentConfirmed: true,
        expiresAt: parsed.data.expiresAt,
        active: true,
        notes: parsed.data.notes,
      },
      create: {
        organizationId,
        normalizedPhoneNumber: normalized.normalizedNumber,
        phoneLastFour: normalized.normalizedNumber.slice(-4),
        region: parsed.data.region,
        ownerName: parsed.data.ownerName,
        purpose: parsed.data.purpose,
        consentConfirmed: true,
        registeredBy: auth.userId,
        expiresAt: parsed.data.expiresAt,
        notes: parsed.data.notes,
      },
    });
    await audit(
      request,
      auth,
      organizationId,
      'test_allowlist.registered',
      'test_call_allowlist',
      row.id,
      { maskedPhone: `********${row.phoneLastFour}`, region: row.region, expiresAt: row.expiresAt },
    );
    return reply.code(201).send({
      allowlist: {
        ...row,
        normalizedPhoneNumber: undefined,
        maskedPhone: `********${row.phoneLastFour}`,
      },
    });
  });
  app.post('/api/v1/test-call-allowlist/:id/disable', async (request, reply) => {
    const auth = await mutate(request, reply, [UserRole.system_admin, UserRole.admin]);
    if (!auth) return;
    const parsed = reasonSchema.safeParse(request.body);
    if (!parsed.success) return deps.error(reply, 400, 'REASON_REQUIRED', '理由が必要です');
    const id = (request.params as { id: string }).id;
    const before = await prisma.testCallAllowlist.findFirst({
      where: { id, organizationId: auth.organizationId },
    });
    if (!before) return deps.error(reply, 404, 'NOT_FOUND', '許可番号がありません');
    const row = await prisma.testCallAllowlist.update({ where: { id }, data: { active: false } });
    await audit(
      request,
      auth,
      auth.organizationId,
      'test_allowlist.disabled',
      'test_call_allowlist',
      id,
      { reason: parsed.data.reason, maskedPhone: `********${row.phoneLastFour}` },
    );
    return {
      allowlist: { id: row.id, active: row.active, maskedPhone: `********${row.phoneLastFour}` },
    };
  });
  app.put('/api/v1/provider-configurations', async (request, reply) => {
    const auth = await mutate(request, reply, [UserRole.system_admin]);
    if (!auth) return;
    const parsed = providerConfigSchema.safeParse(request.body);
    if (!parsed.success) return deps.error(reply, 400, 'VALIDATION_ERROR', parsed.error.message);
    const organizationId = org(auth, parsed.data.organizationId);
    const config = await prisma.providerConfiguration.upsert({
      where: { organizationId_provider: { organizationId, provider: parsed.data.provider } },
      update: {
        allowed: parsed.data.allowed,
        productionEnabled: false,
        secretReferenceKey: parsed.data.secretReferenceKey,
        updatedBy: auth.userId,
      },
      create: {
        organizationId,
        provider: parsed.data.provider,
        allowed: parsed.data.allowed,
        productionEnabled: false,
        secretReferenceKey: parsed.data.secretReferenceKey,
        updatedBy: auth.userId,
      },
    });
    await audit(
      request,
      auth,
      organizationId,
      'provider_configuration.updated',
      'provider_configuration',
      config.id,
      {
        provider: config.provider,
        allowed: config.allowed,
        productionEnabled: false,
        hasSecretReference: Boolean(config.secretReferenceKey),
      },
    );
    return {
      configuration: {
        ...config,
        secretReferenceKey: config.secretReferenceKey ? 'configured' : null,
      },
    };
  });
  app.post('/api/v1/production-gate/evaluate', async (request, reply) => {
    const auth = await mutate(request, reply, [
      UserRole.system_admin,
      UserRole.admin,
      UserRole.manager,
    ]);
    if (!auth) return;
    const parsed = gateInputSchema.safeParse(request.body);
    if (!parsed.success) return deps.error(reply, 400, 'VALIDATION_ERROR', parsed.error.message);
    const organizationId = org(auth, parsed.data.organizationId);
    const decision = await evaluateProductionGate(prisma, { ...parsed.data, organizationId });
    const record = await prisma.productionGateDecision.create({
      data: {
        organizationId,
        campaignId: parsed.data.campaignId,
        companyId: parsed.data.companyId,
        phoneNumberId: parsed.data.phoneNumberId,
        provider: parsed.data.provider,
        allowed: decision.allowed,
        reasonCodes: decision.reasonCodes,
      },
    });
    if (!decision.allowed)
      await audit(
        request,
        auth,
        organizationId,
        'production_gate.rejected',
        'production_gate_decision',
        record.id,
        { reasonCodes: decision.reasonCodes, provider: parsed.data.provider },
      );
    return { decision: { id: record.id, ...decision } };
  });
  app.get('/api/v1/production-usage', async (request, reply) => {
    const auth = await deps.authorize(request, reply, [
      UserRole.system_admin,
      UserRole.admin,
      UserRole.manager,
    ]);
    if (!auth) return;
    const q = request.query as { organizationId?: string };
    const organizationId = org(auth, q.organizationId);
    return {
      usage: await prisma.callUsageCounter.findMany({
        where: { organizationId },
        orderBy: { periodStart: 'desc' },
        take: 20,
      }),
      budgets: await prisma.callBudgetCounter.findMany({
        where: { organizationId },
        orderBy: { periodStart: 'desc' },
        take: 20,
      }),
      rejections: await prisma.productionGateDecision.findMany({
        where: { organizationId, allowed: false },
        orderBy: { evaluatedAt: 'desc' },
        take: 50,
      }),
    };
  });

  app.post('/api/v1/provider-webhooks/mock', async (request, reply) => {
    const parsed = mockWebhookSchema.safeParse(request.body);
    if (!parsed.success) return deps.error(reply, 400, 'VALIDATION_ERROR', 'Webhook形式が不正です');
    const timestamp = request.headers['x-mock-timestamp'];
    const signature = request.headers['x-mock-signature'];
    if (
      typeof timestamp !== 'string' ||
      typeof signature !== 'string' ||
      Math.abs(Date.now() - Date.parse(timestamp)) > 300_000
    )
      return deps.error(reply, 401, 'WEBHOOK_EXPIRED', 'Webhook timestampが期限切れです');
    const expected = createHmac('sha256', deps.webhookSecret)
      .update(`${timestamp}.${JSON.stringify(request.body)}`)
      .digest('hex');
    const valid =
      signature.length === expected.length &&
      timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    if (!valid) {
      await writeAudit(prisma, {
        organizationId: parsed.data.organizationId,
        action: 'provider_webhook.signature_error',
        entityType: 'provider_webhook',
        afterData: { provider: 'mock', eventId: parsed.data.eventId },
      });
      return deps.error(reply, 401, 'INVALID_SIGNATURE', '署名が不正です');
    }
    const existing = await prisma.providerWebhookEvent.findUnique({
      where: {
        provider_providerEventId: { provider: 'mock', providerEventId: parsed.data.eventId },
      },
    });
    if (existing) {
      await writeAudit(prisma, {
        organizationId: existing.organizationId,
        action: 'provider_webhook.duplicate',
        entityType: 'provider_webhook_event',
        entityId: existing.id,
        afterData: { provider: 'mock', eventId: parsed.data.eventId },
      });
      return { accepted: true, duplicate: true, eventId: existing.id };
    }
    const safeData = Object.fromEntries(
      Object.entries(parsed.data.data).filter(
        ([key]) =>
          ![
            'phone',
            'phoneNumber',
            'recordingUrl',
            'transcript',
            'raw',
            'authorization',
            'cookie',
            'secret',
          ].includes(key),
      ),
    );
    const event = await prisma.providerWebhookEvent.create({
      data: {
        organizationId: parsed.data.organizationId,
        provider: 'mock',
        providerEventId: parsed.data.eventId,
        eventType: parsed.data.eventType,
        eventTimestamp: new Date(parsed.data.timestamp),
        callAttemptId: parsed.data.callAttemptId ?? null,
        campaignId: parsed.data.campaignId ?? null,
        sequenceNumber: parsed.data.sequenceNumber ?? null,
        normalizedData: safeData as Prisma.InputJsonValue,
        processingStatus: parsed.data.eventType === 'mock.fail_once' ? 'pending' : 'processed',
        processedAt: parsed.data.eventType === 'mock.fail_once' ? null : new Date(),
      },
    });
    if (event.processingStatus === 'pending') {
      const connection = new Redis(deps.redisUrl, { maxRetriesPerRequest: null });
      const queue = new Queue('sales-ai-jobs', { connection });
      try {
        await queue.add(
          'provider-webhook',
          { eventId: event.id },
          {
            jobId: `provider-webhook-${event.id}`,
            attempts: 3,
            backoff: { type: 'exponential', delay: 100 },
            removeOnComplete: 100,
            removeOnFail: 100,
          },
        );
      } finally {
        await queue.close();
        connection.disconnect();
      }
    }
    return reply.code(202).send({ accepted: true, duplicate: false, eventId: event.id });
  });
}
