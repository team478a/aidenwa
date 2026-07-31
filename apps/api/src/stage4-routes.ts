import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { Prisma, UserRole, evaluateProductionGate, type PrismaClient } from '@sales-ai/database';
import { gateInputSchema, mockWebhookSchema } from '@sales-ai/validation';
import { requestMetadata, writeAudit } from './audit.js';
import { registerAllowlistRoutes } from './modules/production-safety/allowlist/allowlist.routes.js';
import { registerApprovalRoutes } from './modules/production-safety/approval/approval.routes.js';
import { registerEmergencyStopRoutes } from './modules/production-safety/emergency-stop/emergency-stop.routes.js';
import { registerProductionPolicyRoutes } from './modules/production-safety/policy/production-policy.routes.js';
import { registerProviderConfigurationRoutes } from './modules/production-safety/provider-configuration/provider-configuration.routes.js';
import { registerReadinessRoutes } from './modules/production-safety/readiness/readiness.routes.js';
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
  registerEmergencyStopRoutes(app, deps);
  registerAllowlistRoutes(app, deps);
  registerProviderConfigurationRoutes(app, deps);
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
