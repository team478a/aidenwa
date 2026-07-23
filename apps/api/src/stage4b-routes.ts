import { createHash, createHmac } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { Prisma, UserRole, evaluateProductionGate, type PrismaClient } from '@sales-ai/database';
import {
  productionTestAuthorizationSchema,
  providerUnknownResolutionSchema,
  incidentResolutionSchema,
  realCallRequestSchema,
  reasonSchema,
  twilioWebhookParamsSchema,
  sourceNumberApprovalSchema,
  type ApiEnv,
} from '@sales-ai/validation';
import { TwilioVoiceProvider, buildStage4B1Twiml, maskPhone } from '@sales-ai/voice-provider';
import { requestMetadata, writeAudit } from './audit.js';
import type { AuthContext } from './types.js';
type Deps = {
  prisma: PrismaClient;
  env: ApiEnv;
  authorize(
    request: FastifyRequest,
    reply: FastifyReply,
    roles: readonly UserRole[],
  ): Promise<AuthContext | undefined>;
  verifyCsrf(request: FastifyRequest, reply: FastifyReply, auth: AuthContext): boolean;
  error(reply: FastifyReply, code: number, key: string, message: string): unknown;
};
class ReservationConflict extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
export function registerStage4BRoutes(app: FastifyInstance, deps: Deps) {
  const { prisma, env } = deps;
  async function system(request: FastifyRequest, reply: FastifyReply) {
    const auth = await deps.authorize(request, reply, [UserRole.system_admin]);
    if (!auth || !deps.verifyCsrf(request, reply, auth)) return;
    return auth;
  }
  app.get('/api/v1/production-test-authorizations', async (request, reply) => {
    const auth = await deps.authorize(request, reply, [
      UserRole.system_admin,
      UserRole.admin,
      UserRole.manager,
    ]);
    if (!auth) return;
    return {
      authorizations: await prisma.productionTestAuthorization.findMany({
        where: { organizationId: auth.organizationId },
        orderBy: { createdAt: 'desc' },
      }),
    };
  });
  app.get('/api/v1/source-number-approvals', async (request, reply) => {
    const auth = await deps.authorize(request, reply, [UserRole.system_admin]);
    if (!auth) return;
    const rows = await prisma.sourceNumberApproval.findMany({
      where: { organizationId: auth.organizationId, provider: 'twilio' },
      orderBy: { createdAt: 'desc' },
    });
    return {
      approvals: rows.map(({ numberFingerprint, ...row }) => {
        void numberFingerprint;
        return { ...row, maskedNumber: `********${row.numberLastFour}` };
      }),
    };
  });
  app.post('/api/v1/source-number-approvals', async (request, reply) => {
    const auth = await system(request, reply);
    if (!auth) return;
    const parsed = sourceNumberApprovalSchema.safeParse(request.body);
    if (!parsed.success) return deps.error(reply, 400, 'VALIDATION_ERROR', parsed.error.message);
    const fingerprint = sourceFingerprint(env, parsed.data.sourceNumberE164);
    const record = await prisma.sourceNumberApproval.upsert({
      where: {
        organizationId_provider_numberFingerprint: {
          organizationId: auth.organizationId,
          provider: 'twilio',
          numberFingerprint: fingerprint,
        },
      },
      create: {
        organizationId: auth.organizationId,
        provider: 'twilio',
        numberFingerprint: fingerprint,
        numberLastFour: parsed.data.sourceNumberE164.slice(-4),
        ownershipEvidenceRef: parsed.data.ownershipEvidenceRef,
        expiresAt: parsed.data.expiresAt,
        createdBy: auth.userId,
      },
      update: {
        ownershipEvidenceRef: parsed.data.ownershipEvidenceRef,
        expiresAt: parsed.data.expiresAt,
        verificationStatus: 'pending',
        active: false,
        verifiedBy: null,
        verifiedAt: null,
      },
    });
    await audit(
      prisma,
      request,
      auth,
      auth.organizationId,
      'twilio_source_number.registered',
      record.id,
      {
        maskedNumber: `********${record.numberLastFour}`,
        evidenceRef: record.ownershipEvidenceRef,
        expiresAt: record.expiresAt,
      },
    );
    return reply.code(201).send({ approval: { ...record, numberFingerprint: undefined } });
  });
  app.post('/api/v1/source-number-approvals/:id/verify', async (request, reply) => {
    const auth = await system(request, reply);
    if (!auth) return;
    const parsed = incidentResolutionSchema.safeParse(request.body);
    if (!parsed.success) return deps.error(reply, 400, 'REASON_REQUIRED', '確認理由が必要です');
    const id = (request.params as { id: string }).id;
    const before = await prisma.sourceNumberApproval.findFirst({
      where: { id, organizationId: auth.organizationId, expiresAt: { gt: new Date() } },
    });
    if (!before)
      return deps.error(reply, 404, 'SOURCE_NUMBER_NOT_FOUND', '有効な発信元承認がありません');
    const approval = await prisma.sourceNumberApproval.update({
      where: { id },
      data: {
        verificationStatus: 'verified',
        active: true,
        verifiedBy: auth.userId,
        verifiedAt: new Date(),
      },
    });
    await audit(prisma, request, auth, auth.organizationId, 'twilio_source_number.verified', id, {
      maskedNumber: `********${approval.numberLastFour}`,
      reason: parsed.data.reason,
    });
    return { approval: { ...approval, numberFingerprint: undefined } };
  });
  app.post('/api/v1/source-number-approvals/:id/revoke', async (request, reply) => {
    const auth = await system(request, reply);
    if (!auth) return;
    const parsed = incidentResolutionSchema.safeParse(request.body);
    if (!parsed.success) return deps.error(reply, 400, 'REASON_REQUIRED', '取消理由が必要です');
    const id = (request.params as { id: string }).id;
    const result = await prisma.sourceNumberApproval.updateMany({
      where: { id, organizationId: auth.organizationId },
      data: { verificationStatus: 'revoked', active: false },
    });
    if (!result.count)
      return deps.error(reply, 404, 'SOURCE_NUMBER_NOT_FOUND', '発信元承認がありません');
    await prisma.productionTestAuthorization.updateMany({
      where: { organizationId: auth.organizationId, sourceNumberApprovalId: id, status: 'active' },
      data: { status: 'suspended', decisionReason: 'source_number_revoked' },
    });
    await audit(prisma, request, auth, auth.organizationId, 'twilio_source_number.revoked', id, {
      reason: parsed.data.reason,
    });
    return { revoked: true };
  });
  app.get('/api/v1/production-incidents', async (request, reply) => {
    const auth = await deps.authorize(request, reply, [
      UserRole.system_admin,
      UserRole.admin,
      UserRole.manager,
    ]);
    if (!auth) return;
    return {
      incidents: await prisma.productionIncident.findMany({
        where: { organizationId: auth.organizationId },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    };
  });
  app.post('/api/v1/production-incidents/:id/resolve', async (request, reply) => {
    const auth = await system(request, reply);
    if (!auth) return;
    const parsed = incidentResolutionSchema.safeParse(request.body);
    if (!parsed.success) return deps.error(reply, 400, 'REASON_REQUIRED', '解決理由が必要です');
    const id = (request.params as { id: string }).id;
    const result = await prisma.productionIncident.updateMany({
      where: { id, organizationId: auth.organizationId, status: { not: 'resolved' } },
      data: {
        status: 'resolved',
        resolvedBy: auth.userId,
        resolvedAt: new Date(),
        resolutionReason: parsed.data.reason,
      },
    });
    if (!result.count)
      return deps.error(reply, 404, 'INCIDENT_NOT_FOUND', '未解決incidentがありません');
    return { resolved: true };
  });
  app.post('/api/v1/production-test-authorizations', async (request, reply) => {
    const auth = await system(request, reply);
    if (!auth) return;
    const parsed = productionTestAuthorizationSchema.safeParse(request.body);
    if (!parsed.success) return deps.error(reply, 400, 'VALIDATION_ERROR', parsed.error.message);
    const organizationId = parsed.data.organizationId ?? auth.organizationId;
    const allow = await prisma.testCallAllowlist.findMany({
      where: {
        id: { in: parsed.data.approvedAllowlistIds },
        organizationId,
        active: true,
        consentConfirmed: true,
        expiresAt: { gt: new Date() },
      },
    });
    if (allow.length !== parsed.data.approvedAllowlistIds.length)
      return deps.error(reply, 409, 'ALLOWLIST_INVALID', '同意済み有効番号だけを指定してください');
    const record = await prisma.productionTestAuthorization.create({
      data: {
        ...parsed.data,
        organizationId,
        provider: 'twilio',
        status: 'draft',
        createdBy: auth.userId,
      },
    });
    await audit(prisma, request, auth, organizationId, 'twilio_limited_test.created', record.id, {
      releaseCommit: record.releaseCommit,
      maxCalls: record.maxCalls,
      destinations: allow.map((x) => `********${x.phoneLastFour}`),
    });
    return reply.code(201).send({ authorization: record });
  });
  for (const [action, status] of [
    ['approve', 'approved'],
    ['activate', 'active'],
    ['suspend', 'suspended'],
    ['cancel', 'cancelled'],
  ] as const)
    app.post(`/api/v1/production-test-authorizations/:id/${action}`, async (request, reply) => {
      const auth = await system(request, reply);
      if (!auth) return;
      const parsed = reasonSchema.safeParse(request.body);
      if (!parsed.success) return deps.error(reply, 400, 'REASON_REQUIRED', '理由が必要です');
      const id = (request.params as { id: string }).id;
      const before = await prisma.productionTestAuthorization.findUnique({ where: { id } });
      if (!before) return deps.error(reply, 404, 'NOT_FOUND', '限定テスト承認がありません');
      const allowedPrevious: Record<typeof action, string[]> = {
        approve: ['draft'],
        activate: ['approved'],
        suspend: ['approved', 'active'],
        cancel: ['draft', 'approved', 'active', 'suspended'],
      };
      if (!allowedPrevious[action].includes(before.status))
        return deps.error(
          reply,
          409,
          'INVALID_STATE_TRANSITION',
          `${before.status}から${status}へ変更できません`,
        );
      if (action === 'activate') {
        const blockers = activationBlockers(
          env,
          before.releaseCommit,
          before.writtenApprovalCommit,
        );
        if (before.startsAt > new Date() || before.endsAt <= new Date())
          blockers.push('TEST_WINDOW');
        const [approval, providerConfig, activeStop, sourceNumber] = await Promise.all([
          prisma.productionCallApproval.findFirst({
            where: {
              organizationId: before.organizationId,
              status: 'approved',
              expiresAt: { gt: new Date() },
              plannedProvider: 'twilio',
            },
            orderBy: { decidedAt: 'desc' },
          }),
          prisma.providerConfiguration.findUnique({
            where: {
              organizationId_provider: {
                organizationId: before.organizationId,
                provider: 'twilio',
              },
            },
          }),
          prisma.emergencyStop.findFirst({
            where: {
              active: true,
              OR: [{ scope: 'system' }, { organizationId: before.organizationId }],
            },
          }),
          before.sourceNumberApprovalId
            ? prisma.sourceNumberApproval.findFirst({
                where: {
                  id: before.sourceNumberApprovalId,
                  organizationId: before.organizationId,
                  provider: 'twilio',
                  verificationStatus: 'verified',
                  active: true,
                  expiresAt: { gt: new Date() },
                },
              })
            : null,
        ]);
        if (!approval) blockers.push('STAGE4A_APPROVAL');
        if (!providerConfig?.allowed) blockers.push('PROVIDER_CONFIGURATION');
        if (activeStop) blockers.push('EMERGENCY_STOP');
        if (!sourceNumber) blockers.push('SOURCE_NUMBER_APPROVAL');
        if (blockers.length)
          return deps.error(reply, 409, 'PRODUCTION_DISABLED', blockers.join(','));
      }
      const updated = await prisma.productionTestAuthorization.update({
        where: { id },
        data: {
          status,
          ...(action === 'approve'
            ? { approvedBy: auth.userId, approvedAt: new Date() }
            : {
                ...(action === 'activate'
                  ? { activatedBy: auth.userId, activatedAt: new Date() }
                  : {}),
              }),
          decisionReason: parsed.data.reason,
        },
      });
      if (action === 'activate')
        await prisma.providerConfiguration.updateMany({
          where: { organizationId: before.organizationId, provider: 'twilio', allowed: true },
          data: { productionEnabled: true, updatedBy: auth.userId },
        });
      await audit(
        prisma,
        request,
        auth,
        before.organizationId,
        `twilio_limited_test.${action}`,
        id,
        { status, reason: parsed.data.reason },
      );
      return { authorization: updated };
    });
  app.post('/api/v1/production-test-authorizations/:id/rollback', async (request, reply) => {
    const auth = await system(request, reply);
    if (!auth) return;
    const parsed = reasonSchema.safeParse(request.body);
    if (!parsed.success)
      return deps.error(reply, 400, 'REASON_REQUIRED', 'ロールバック理由が必要です');
    const id = (request.params as { id: string }).id;
    const before = await prisma.productionTestAuthorization.findUnique({ where: { id } });
    if (!before) return deps.error(reply, 404, 'NOT_FOUND', '限定テスト承認がありません');
    const [, authorization] = await prisma.$transaction([
      prisma.providerConfiguration.updateMany({
        where: { organizationId: before.organizationId, provider: 'twilio' },
        data: { productionEnabled: false, updatedBy: auth.userId },
      }),
      prisma.productionTestAuthorization.update({
        where: { id },
        data: {
          status: 'suspended',
          rollbackStatus: 'requested',
          decisionReason: parsed.data.reason,
        },
      }),
    ]);
    const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
    const queue = new Queue('sales-ai-jobs', { connection });
    try {
      await queue.add(
        'twilio-emergency-stop',
        {
          organizationId: before.organizationId,
          scope: 'organization',
          authorizationId: before.id,
        },
        {
          jobId: `twilio-rollback-${id}-${Date.now()}`,
          attempts: 3,
          removeOnComplete: 100,
          removeOnFail: 100,
        },
      );
    } finally {
      await queue.close();
      connection.disconnect();
    }
    await audit(prisma, request, auth, before.organizationId, 'twilio_limited_test.rollback', id, {
      reason: parsed.data.reason,
      status: 'requested',
    });
    return reply.code(202).send({ authorization });
  });
  app.post('/api/v1/real-calls/:id/resolve-provider-unknown', async (request, reply) => {
    const auth = await system(request, reply);
    if (!auth) return;
    const parsed = providerUnknownResolutionSchema.safeParse(request.body);
    if (!parsed.success) return deps.error(reply, 400, 'VALIDATION_ERROR', parsed.error.message);
    const id = (request.params as { id: string }).id;
    const before = await prisma.realCallExecution.findFirst({
      where: {
        id,
        organizationId: auth.organizationId,
        state: 'provider_unknown',
        providerUnknown: true,
      },
    });
    if (!before)
      return deps.error(reply, 404, 'PROVIDER_UNKNOWN_NOT_FOUND', '確認待ち実行がありません');
    const execution =
      parsed.data.resolution === 'confirmed_not_created'
        ? await prisma.realCallExecution.update({
            where: { id },
            data: { state: 'failed', providerUnknown: false, endedAt: new Date() },
          })
        : before;
    if (parsed.data.resolution === 'incident')
      await openIncident(prisma, {
        organizationId: before.organizationId,
        category: 'provider_unknown',
        entityType: 'real_call_execution',
        entityId: before.id,
        summary: 'Twilio Call作成結果が不明です',
        details: { provider: 'twilio', callFingerprint: before.providerCallIdFingerprint },
      });
    await audit(
      prisma,
      request,
      auth,
      before.organizationId,
      'twilio_call.provider_unknown_resolved',
      id,
      { resolution: parsed.data.resolution, reason: parsed.data.reason, redialScheduled: false },
    );
    return { execution: { ...execution, providerCallId: null } };
  });
  app.post('/api/v1/real-calls/manual', async (request, reply) => {
    const auth = await system(request, reply);
    if (!auth) return;
    const parsed = realCallRequestSchema.safeParse(request.body);
    if (!parsed.success) return deps.error(reply, 400, 'VALIDATION_ERROR', parsed.error.message);
    const authorization = await prisma.productionTestAuthorization.findFirst({
      where: {
        id: parsed.data.authorizationId,
        organizationId: auth.organizationId,
        status: 'active',
        startsAt: { lte: new Date() },
        endsAt: { gt: new Date() },
      },
    });
    if (!authorization)
      return deps.error(reply, 409, 'LIMITED_TEST_INACTIVE', '有効な限定テスト承認がありません');
    const blockers = activationBlockers(
      env,
      authorization.releaseCommit,
      authorization.writtenApprovalCommit,
    );
    if (blockers.length) return deps.error(reply, 409, 'PRODUCTION_DISABLED', blockers.join(','));
    const allow = await prisma.testCallAllowlist.findFirst({
      where: {
        id: parsed.data.allowlistId,
        organizationId: auth.organizationId,
        active: true,
        consentConfirmed: true,
        expiresAt: { gt: new Date() },
      },
    });
    const phone = await prisma.phoneNumber.findFirst({
      where: {
        id: parsed.data.phoneNumberId,
        organizationId: auth.organizationId,
        companyId: parsed.data.companyId,
        isDeleted: false,
      },
    });
    if (!allow || !phone || allow.normalizedPhoneNumber !== phone.normalizedNumber)
      return deps.error(reply, 409, 'DESTINATION_NOT_ALLOWED', '許可番号と架電先が一致しません');
    if (!(authorization.approvedAllowlistIds as string[]).includes(allow.id))
      return deps.error(reply, 409, 'DESTINATION_NOT_APPROVED', '限定承認の対象外です');
    const gate = await evaluateProductionGate(prisma, {
      organizationId: auth.organizationId,
      campaignId: parsed.data.campaignId,
      companyId: parsed.data.companyId,
      phoneNumberId: phone.id,
      provider: 'twilio',
      region: allow.region,
    });
    if (!gate.allowed)
      return deps.error(reply, 409, 'PRODUCTION_GATE_REJECTED', gate.reasonCodes.join(','));
    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setUTCHours(0, 0, 0, 0);
    const hourStart = new Date(now.getTime() - 3_600_000);
    const estimate =
      Math.ceil(authorization.maxCallSeconds / 60) * env.TWILIO_ESTIMATED_COST_MINOR_PER_MINUTE;
    let execution;
    try {
      execution = await prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw(
            Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${auth.organizationId}, 0))`,
          );
          const [used, sameDestination, activeCalls, todayCalls, hourlyCalls, reserved] =
            await Promise.all([
              tx.realCallExecution.count({ where: { authorizationId: authorization.id } }),
              tx.realCallExecution.count({
                where: { authorizationId: authorization.id, phoneNumberId: phone.id },
              }),
              tx.realCallExecution.count({
                where: {
                  organizationId: auth.organizationId,
                  state: { in: ['reserved', 'queued', 'initiated', 'ringing', 'in_progress'] },
                },
              }),
              tx.realCallExecution.count({
                where: { authorizationId: authorization.id, createdAt: { gte: dayStart } },
              }),
              tx.realCallExecution.count({
                where: { authorizationId: authorization.id, createdAt: { gte: hourStart } },
              }),
              tx.realCallExecution.aggregate({
                where: { authorizationId: authorization.id },
                _sum: { reservedCostMinor: true },
              }),
            ]);
          if (used >= authorization.maxCalls)
            throw new ReservationConflict('LIMITED_TEST_LIMIT', '最大5件に到達しています');
          if (sameDestination)
            throw new ReservationConflict(
              'DESTINATION_ALREADY_CALLED',
              '同じ番号へ再発信できません',
            );
          if (activeCalls)
            throw new ReservationConflict('CONCURRENT_CALL_LIMIT', '同時通話上限は1件です');
          if (todayCalls >= 5 || hourlyCalls >= 5)
            throw new ReservationConflict(
              'REAL_CALL_RATE_LIMIT',
              '日次または時間上限に到達しています',
            );
          if ((reserved._sum.reservedCostMinor ?? 0) + estimate > authorization.budgetLimitMinor)
            throw new ReservationConflict('BUDGET_LIMIT', '予算上限を超えるため予約できません');
          return tx.realCallExecution.create({
            data: {
              organizationId: auth.organizationId,
              authorizationId: authorization.id,
              campaignId: parsed.data.campaignId,
              companyId: parsed.data.companyId,
              phoneNumberId: phone.id,
              allowlistId: allow.id,
              idempotencyKey: `twilio:${authorization.id}:${phone.id}`,
              estimatedCostMinor: estimate,
              reservedCostMinor: estimate,
              currency: authorization.currency,
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (cause) {
      if (cause instanceof ReservationConflict)
        return deps.error(reply, 409, cause.code, cause.message);
      throw cause;
    }
    const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
    const queue = new Queue('sales-ai-jobs', { connection });
    try {
      await queue.add(
        'twilio-call',
        { executionId: execution.id },
        {
          jobId: `twilio-call-${execution.id}`,
          attempts: 1,
          removeOnComplete: 100,
          removeOnFail: 100,
        },
      );
    } finally {
      await queue.close();
      connection.disconnect();
    }
    await audit(prisma, request, auth, auth.organizationId, 'twilio_call.reserved', execution.id, {
      destination: maskPhone(phone.normalizedNumber),
      estimatedCostMinor: estimate,
      currency: authorization.currency,
    });
    return reply.code(202).send({ execution: { ...execution, providerCallId: null } });
  });
  app.get('/api/v1/real-calls', async (request, reply) => {
    const auth = await deps.authorize(request, reply, [
      UserRole.system_admin,
      UserRole.admin,
      UserRole.manager,
    ]);
    if (!auth) return;
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const [rows, todayCount, activeCount, costs, stop, rejectedGate, config] = await Promise.all([
      prisma.realCallExecution.findMany({
        where: { organizationId: auth.organizationId },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      prisma.realCallExecution.count({
        where: { organizationId: auth.organizationId, createdAt: { gte: today } },
      }),
      prisma.realCallExecution.count({
        where: {
          organizationId: auth.organizationId,
          state: { in: ['queued', 'initiated', 'ringing', 'in_progress'] },
        },
      }),
      prisma.realCallExecution.aggregate({
        where: { organizationId: auth.organizationId },
        _sum: { estimatedCostMinor: true, finalCostMinor: true },
      }),
      prisma.emergencyStop.findFirst({
        where: {
          active: true,
          OR: [{ scope: 'system' }, { organizationId: auth.organizationId }],
        },
        orderBy: { activatedAt: 'desc' },
      }),
      prisma.productionGateDecision.findFirst({
        where: { organizationId: auth.organizationId, provider: 'twilio', allowed: false },
        orderBy: { evaluatedAt: 'desc' },
      }),
      prisma.providerConfiguration.findUnique({
        where: {
          organizationId_provider: { organizationId: auth.organizationId, provider: 'twilio' },
        },
      }),
    ]);
    return {
      summary: {
        todayCount,
        activeCount,
        estimatedCostMinor: costs._sum.estimatedCostMinor ?? 0,
        finalCostMinor: costs._sum.finalCostMinor ?? 0,
        currency: rows[0]?.currency ?? 'JPY',
        emergencyStopActive: Boolean(stop),
        lastGateRejectionReasons: (rejectedGate?.reasonCodes as string[] | undefined) ?? [],
        ...(auth.role === UserRole.system_admin
          ? {
              twilioConnectionState:
                config?.allowed &&
                config.productionEnabled &&
                !activationBlockers(env, env.RELEASE_COMMIT, env.RELEASE_COMMIT).length
                  ? 'connected'
                  : config?.allowed
                    ? 'disabled'
                    : 'not_configured',
            }
          : {}),
      },
      executions: rows.map((x) => ({
        ...x,
        providerCallId: x.providerCallId
          ? `${x.providerCallId.slice(0, 6)}…${x.providerCallId.slice(-4)}`
          : null,
      })),
    };
  });
  app.post('/api/v1/twilio/twiml/:executionId', twilioHandler('twiml'));
  app.post('/api/v1/twilio/dtmf/:executionId', twilioHandler('dtmf'));
  app.post('/api/v1/twilio/status/:executionId', twilioHandler('status'));
  function twilioHandler(kind: 'twiml' | 'dtmf' | 'status') {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const executionId = (request.params as { executionId: string }).executionId;
      const execution = await prisma.realCallExecution.findUnique({ where: { id: executionId } });
      if (!execution)
        return deps.error(reply, 403, 'UNAPPROVED_CALL', '承認済み通話ではありません');
      const params = Object.fromEntries(
        Object.entries(request.body as Record<string, unknown>).filter(
          ([, v]) => typeof v === 'string',
        ),
      ) as Record<string, string>;
      const parsed = twilioWebhookParamsSchema.safeParse(params);
      if (
        !parsed.success ||
        (execution.providerCallId && parsed.data.CallSid !== execution.providerCallId)
      )
        return deps.error(reply, 403, 'INVALID_PROVIDER_EVENT', '通話相関が不正です');
      const provider = providerFromEnv(env);
      const signature = request.headers['x-twilio-signature'];
      const base =
        kind === 'status' ? env.TWILIO_STATUS_CALLBACK_BASE_URL : env.TWILIO_TWIML_BASE_URL;
      const url = `${base}${request.raw.url ?? ''}`;
      if (typeof signature !== 'string' || !provider.validateWebhook(signature, url, params)) {
        await writeAudit(prisma, {
          organizationId: execution.organizationId,
          action: 'twilio_webhook.signature_error',
          entityType: 'real_call_execution',
          entityId: execution.id,
          afterData: { kind },
        });
        await openIncident(prisma, {
          organizationId: execution.organizationId,
          category: 'webhook_signature_invalid',
          entityType: 'real_call_execution',
          entityId: execution.id,
          summary: 'Twilio Webhook署名検証に失敗しました',
          details: { kind },
        });
        return deps.error(reply, 403, 'INVALID_SIGNATURE', 'Twilio署名が不正です');
      }
      if (!execution.providerCallId) {
        if (!['reserved', 'provider_unknown'].includes(execution.state))
          return deps.error(reply, 403, 'INVALID_PROVIDER_EVENT', 'Call SIDを関連付けできません');
        await prisma.realCallExecution.update({
          where: { id: execution.id },
          data: {
            providerCallId: parsed.data.CallSid,
            providerCallIdFingerprint: `${parsed.data.CallSid.slice(0, 4)}…${parsed.data.CallSid.slice(-4)}`,
          },
        });
      }
      if (kind === 'twiml') {
        reply.type('application/xml');
        return reply.send(
          buildStage4B1Twiml(
            `${env.TWILIO_TWIML_BASE_URL}/api/v1/twilio/dtmf/${execution.id}?retry=0`,
            env.TWILIO_VOICE_NAME,
          ),
        );
      }
      if (kind === 'dtmf') {
        const result = dtmfResult(parsed.data.Digits);
        const retry = (request.query as { retry?: string }).retry === '1';
        if (result === 'test_no_input' && !retry) {
          reply.type('application/xml');
          return reply.send(
            buildStage4B1Twiml(
              `${env.TWILIO_TWIML_BASE_URL}/api/v1/twilio/dtmf/${execution.id}?retry=1`,
              env.TWILIO_VOICE_NAME,
              true,
            ),
          );
        }
        await prisma.$transaction(async (tx) => {
          await tx.realCallExecution.update({
            where: { id: execution.id },
            data: { dtmfResult: result },
          });
          if (result === 'test_stop_requested') {
            await tx.testCallAllowlist.update({
              where: { id: execution.allowlistId },
              data: { active: false },
            });
            await tx.realCallExecution.updateMany({
              where: { allowlistId: execution.allowlistId, state: 'reserved' },
              data: { state: 'canceled' },
            });
          }
        });
        reply.type('application/xml');
        return reply.send(
          '<Response><Say language="ja-JP">入力を記録しました。テストを終了します。</Say><Hangup/></Response>',
        );
      }
      const state = mapTwilioState(parsed.data.CallStatus);
      const fingerprint = createHash('sha256')
        .update(
          JSON.stringify({
            status: parsed.data.CallStatus ?? 'unknown',
            sequence: parsed.data.SequenceNumber ?? 0,
            duration: parsed.data.CallDuration ?? null,
            price: parsed.data.Price ?? null,
            currency: parsed.data.PriceUnit ?? null,
          }),
        )
        .digest('hex')
        .slice(0, 24);
      const eventKey = `${parsed.data.CallSid}:${parsed.data.CallStatus ?? 'unknown'}:${parsed.data.SequenceNumber ?? 0}:${fingerprint}`;
      try {
        await prisma.providerWebhookEvent.create({
          data: {
            organizationId: execution.organizationId,
            provider: 'twilio',
            providerEventId: eventKey,
            eventType: `twilio.${parsed.data.CallStatus ?? 'unknown'}`,
            eventTimestamp: new Date(),
            sequenceNumber: parsed.data.SequenceNumber ?? null,
            normalizedData: {
              state,
              callFingerprint: `${parsed.data.CallSid.slice(0, 4)}…${parsed.data.CallSid.slice(-4)}`,
            },
            processingStatus: 'processed',
            processedAt: new Date(),
          },
        });
      } catch (cause) {
        if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === 'P2002')
          return reply.code(204).send();
        throw cause;
      }
      if (shouldAdvance(execution.state, state)) {
        const finalCost = parsed.data.Price
          ? Math.ceil(Math.abs(Number(parsed.data.Price)) * 100)
          : undefined;
        await prisma.realCallExecution.update({
          where: { id: execution.id },
          data: {
            state,
            ...(state === 'in_progress' ? { answeredAt: new Date() } : {}),
            ...(['completed', 'busy', 'no_answer', 'failed', 'canceled'].includes(state)
              ? {
                  endedAt: new Date(),
                  ...(finalCost !== undefined
                    ? {
                        finalCostMinor: finalCost,
                        reservedCostMinor: finalCost,
                        ...(parsed.data.PriceUnit
                          ? { currency: parsed.data.PriceUnit.toUpperCase() }
                          : {}),
                      }
                    : {}),
                }
              : {}),
          },
        });
        if (finalCost !== undefined) {
          const authorization = await prisma.productionTestAuthorization.findUnique({
            where: { id: execution.authorizationId },
          });
          if (authorization) {
            const total = await prisma.realCallExecution.aggregate({
              where: { authorizationId: authorization.id },
              _sum: { reservedCostMinor: true },
            });
            const beforeTotal =
              (total._sum.reservedCostMinor ?? 0) - finalCost + execution.reservedCostMinor;
            const afterTotal = total._sum.reservedCostMinor ?? 0;
            const thresholds = crossedBudgetThresholds(
              beforeTotal,
              afterTotal,
              authorization.budgetLimitMinor,
            );
            for (const threshold of thresholds)
              await writeAudit(prisma, {
                organizationId: execution.organizationId,
                action: `twilio_budget.${threshold}`,
                entityType: 'production_test_authorization',
                entityId: authorization.id,
                afterData: { threshold, amountMinor: afterTotal, currency: authorization.currency },
              });
            if (thresholds.includes('100_percent'))
              await prisma.$transaction([
                prisma.productionTestAuthorization.update({
                  where: { id: authorization.id },
                  data: { status: 'suspended', decisionReason: 'budget_100_percent' },
                }),
                prisma.providerConfiguration.updateMany({
                  where: { organizationId: execution.organizationId, provider: 'twilio' },
                  data: { productionEnabled: false },
                }),
              ]);
          }
        }
      }
      return reply.code(204).send();
    };
  }
}
function activationBlockers(env: ApiEnv, release: string, written: string) {
  const b: string[] = [];
  if (env.NODE_ENV !== 'production') b.push('NODE_ENV');
  if (env.VOICE_PROVIDER !== 'twilio') b.push('VOICE_PROVIDER');
  if (!env.PRODUCTION_CALLS_ENABLED) b.push('PRODUCTION_CALLS_ENABLED');
  if (!env.PRODUCTION_PROVIDER_ALLOWLIST.split(',').includes('twilio'))
    b.push('PROVIDER_ALLOWLIST');
  if (env.RELEASE_COMMIT !== release || release !== written) b.push('RELEASE_COMMIT');
  for (const k of [
    'TWILIO_ACCOUNT_SID',
    'TWILIO_API_KEY_SID',
    'TWILIO_API_KEY_SECRET',
    'TWILIO_AUTH_TOKEN',
    'TWILIO_FROM_NUMBER',
    'TWILIO_STATUS_CALLBACK_BASE_URL',
    'TWILIO_TWIML_BASE_URL',
  ] as const)
    if (!env[k]) b.push(k);
  return b;
}
function providerFromEnv(env: ApiEnv) {
  if (
    !env.TWILIO_ACCOUNT_SID ||
    !env.TWILIO_API_KEY_SID ||
    !env.TWILIO_API_KEY_SECRET ||
    !env.TWILIO_AUTH_TOKEN
  )
    throw new Error('twilio_credentials_unavailable');
  return new TwilioVoiceProvider({
    accountSid: env.TWILIO_ACCOUNT_SID,
    apiKeySid: env.TWILIO_API_KEY_SID,
    apiKeySecret: env.TWILIO_API_KEY_SECRET,
    authToken: env.TWILIO_AUTH_TOKEN,
    region: env.TWILIO_REGION,
    edge: env.TWILIO_EDGE,
    estimatedCostMinorPerMinute: env.TWILIO_ESTIMATED_COST_MINOR_PER_MINUTE,
    currency: 'JPY',
  });
}
function dtmfResult(v?: string) {
  return v === '1'
    ? 'test_audio_ok'
    : v === '2'
      ? 'test_audio_issue'
      : v === '9'
        ? 'test_stop_requested'
        : v
          ? 'test_invalid_input'
          : 'test_no_input';
}
function mapTwilioState(v?: string) {
  return (
    (
      {
        initiated: 'initiated',
        ringing: 'ringing',
        'in-progress': 'in_progress',
        completed: 'completed',
        busy: 'busy',
        'no-answer': 'no_answer',
        failed: 'failed',
        canceled: 'canceled',
      } as Record<
        string,
        | 'initiated'
        | 'ringing'
        | 'in_progress'
        | 'completed'
        | 'busy'
        | 'no_answer'
        | 'failed'
        | 'canceled'
      >
    )[v ?? ''] ?? 'provider_unknown'
  );
}
function shouldAdvance(current: string, next: string) {
  const terminal = ['completed', 'busy', 'no_answer', 'failed', 'canceled'];
  if (terminal.includes(current)) return false;
  if (terminal.includes(next)) return true;
  const rank: Record<string, number> = {
    reserved: 0,
    provider_unknown: 0,
    queued: 1,
    initiated: 2,
    ringing: 3,
    in_progress: 4,
  };
  return (rank[next] ?? 0) >= (rank[current] ?? 0);
}
export function crossedBudgetThresholds(before: number, after: number, limit: number) {
  if (limit <= 0) return ['100_percent'] as const;
  return [
    ...(before < limit * 0.8 && after >= limit * 0.8 ? ['80_percent' as const] : []),
    ...(before < limit * 0.9 && after >= limit * 0.9 ? ['90_percent' as const] : []),
    ...(before < limit && after >= limit ? ['100_percent' as const] : []),
  ];
}
async function audit(
  prisma: PrismaClient,
  request: FastifyRequest,
  auth: AuthContext,
  org: string,
  action: string,
  id: string,
  afterData: unknown,
) {
  await writeAudit(prisma, {
    organizationId: org,
    userId: auth.userId,
    action,
    entityType: 'stage4b1',
    entityId: id,
    afterData,
    ...requestMetadata(request),
  });
}
function sourceFingerprint(env: ApiEnv, value: string) {
  return createHmac('sha256', env.SOURCE_NUMBER_FINGERPRINT_KEY).update(value).digest('hex');
}
async function openIncident(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    category: string;
    entityType: string;
    entityId?: string | null;
    summary: string;
    details: Prisma.InputJsonObject;
  },
) {
  const existing = await prisma.productionIncident.findFirst({
    where: {
      organizationId: input.organizationId,
      category: input.category,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      status: { in: ['open', 'investigating'] },
    },
  });
  if (existing) return existing;
  return prisma.productionIncident.create({
    data: {
      organizationId: input.organizationId,
      category: input.category,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      summary: input.summary,
      sanitizedDetails: input.details,
      dueAt: new Date(Date.now() + 3_600_000),
    },
  });
}
