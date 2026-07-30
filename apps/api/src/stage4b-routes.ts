import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { UserRole, type PrismaClient } from '@sales-ai/database';
import {
  productionTestAuthorizationSchema,
  providerUnknownResolutionSchema,
  realCallRequestSchema,
  reasonSchema,
  type ApiEnv,
} from '@sales-ai/validation';
import { maskPhone } from '@sales-ai/voice-provider';
import { requestMetadata, writeAudit } from './audit.js';
import { enqueueOutbox } from './outbox.js';
import type { AuthContext } from './types.js';
import {
  activationBlockers,
  crossedBudgetThresholds,
} from './modules/production-calls/production-call.policy.js';
import {
  ProductionReservationError,
  reserveProductionCall,
} from './modules/production-calls/reservation.service.js';
import { openProductionIncident } from './modules/production-calls/incident.service.js';
import { createTwilioWebhookHandler } from './modules/production-calls/twilio-webhook.service.js';
import { registerSourceNumberRoutes } from './modules/production-calls/source-number.controller.js';
import { registerProductionIncidentRoutes } from './modules/production-calls/incident.controller.js';
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
export function registerStage4BRoutes(app: FastifyInstance, deps: Deps) {
  const { prisma, env } = deps;
  async function system(request: FastifyRequest, reply: FastifyReply) {
    const auth = await deps.authorize(request, reply, [UserRole.system_admin]);
    if (!auth || !deps.verifyCsrf(request, reply, auth)) return;
    return auth;
  }
  const controllerDeps = {
    prisma,
    env,
    authorize: (request: FastifyRequest, reply: FastifyReply, roles: readonly UserRole[]) =>
      deps.authorize(request, reply, roles),
    system,
    error: (reply: FastifyReply, code: number, key: string, message: string) =>
      deps.error(reply, code, key, message),
    audit,
  };
  registerSourceNumberRoutes(app, controllerDeps);
  registerProductionIncidentRoutes(app, controllerDeps);
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
    const authorization = await prisma.$transaction(async (tx) => {
      await tx.providerConfiguration.updateMany({
        where: { organizationId: before.organizationId, provider: 'twilio' },
        data: { productionEnabled: false, updatedBy: auth.userId },
      });
      const updated = await tx.productionTestAuthorization.update({
        where: { id },
        data: {
          status: 'suspended',
          rollbackStatus: 'requested',
          decisionReason: parsed.data.reason,
        },
      });
      await enqueueOutbox(tx, {
        organizationId: before.organizationId,
        eventType: 'twilio-emergency-stop',
        aggregateType: 'production_test_authorization',
        aggregateId: before.id,
        payload: {
          organizationId: before.organizationId,
          scope: 'organization',
          authorizationId: before.id,
        },
      });
      return updated;
    });
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
      await openProductionIncident(prisma, {
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
    let reservation;
    try {
      reservation = await reserveProductionCall(prisma, env, auth.organizationId, parsed.data);
    } catch (cause) {
      if (cause instanceof ProductionReservationError)
        return deps.error(reply, 409, cause.code, cause.message);
      throw cause;
    }
    await audit(
      prisma,
      request,
      auth,
      auth.organizationId,
      'twilio_call.reserved',
      reservation.execution.id,
      {
        destination: maskPhone(reservation.normalizedPhoneNumber),
        estimatedCostMinor: reservation.estimatedCostMinor,
        currency: reservation.currency,
      },
    );
    return reply.code(202).send({ execution: { ...reservation.execution, providerCallId: null } });
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
  const twilioHandler = createTwilioWebhookHandler({
    prisma,
    env,
    error: (reply, code, key, message) => deps.error(reply, code, key, message),
  });
  app.post('/api/v1/twilio/twiml/:executionId', twilioHandler('twiml'));
  app.post('/api/v1/twilio/dtmf/:executionId', twilioHandler('dtmf'));
  app.post('/api/v1/twilio/status/:executionId', twilioHandler('status'));
}
export { crossedBudgetThresholds };
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
