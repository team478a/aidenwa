import type { FastifyInstance } from 'fastify';
import { UserRole } from '@sales-ai/database';
import { providerUnknownResolutionSchema, realCallRequestSchema } from '@sales-ai/validation';
import { maskPhone } from '@sales-ai/voice-provider';
import type { ProductionControllerDependencies } from './controller.types.js';
import { openProductionIncident } from './incident.service.js';
import { activationBlockers } from './production-call.policy.js';
import { ProductionReservationError, reserveProductionCall } from './reservation.service.js';

export function registerRealCallRoutes(
  app: FastifyInstance,
  deps: ProductionControllerDependencies,
) {
  const { prisma, env } = deps;
  app.post('/api/v1/real-calls/:id/resolve-provider-unknown', async (request, reply) => {
    const auth = await deps.system(request, reply);
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
    await deps.audit(
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
    const auth = await deps.system(request, reply);
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
    await deps.audit(
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
    return reply.code(202).send({
      execution: { ...reservation.execution, providerCallId: null },
    });
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
      executions: rows.map((execution) => ({
        ...execution,
        providerCallId: execution.providerCallId
          ? `${execution.providerCallId.slice(0, 6)}…${execution.providerCallId.slice(-4)}`
          : null,
      })),
    };
  });
}
