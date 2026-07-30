import type { FastifyInstance } from 'fastify';
import { UserRole } from '@sales-ai/database';
import { productionTestAuthorizationSchema, reasonSchema } from '@sales-ai/validation';
import { enqueueOutbox } from '../../outbox.js';
import type { ProductionControllerDependencies } from './controller.types.js';
import { activationBlockers } from './production-call.policy.js';

export function registerAuthorizationRoutes(
  app: FastifyInstance,
  deps: ProductionControllerDependencies,
) {
  const { prisma, env } = deps;
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
    const auth = await deps.system(request, reply);
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
    await deps.audit(
      prisma,
      request,
      auth,
      organizationId,
      'twilio_limited_test.created',
      record.id,
      {
        releaseCommit: record.releaseCommit,
        maxCalls: record.maxCalls,
        destinations: allow.map((item) => `********${item.phoneLastFour}`),
      },
    );
    return reply.code(201).send({ authorization: record });
  });
  for (const [action, status] of [
    ['approve', 'approved'],
    ['activate', 'active'],
    ['suspend', 'suspended'],
    ['cancel', 'cancelled'],
  ] as const)
    app.post(`/api/v1/production-test-authorizations/:id/${action}`, async (request, reply) => {
      const auth = await deps.system(request, reply);
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
            : action === 'activate'
              ? { activatedBy: auth.userId, activatedAt: new Date() }
              : {}),
          decisionReason: parsed.data.reason,
        },
      });
      if (action === 'activate')
        await prisma.providerConfiguration.updateMany({
          where: { organizationId: before.organizationId, provider: 'twilio', allowed: true },
          data: { productionEnabled: true, updatedBy: auth.userId },
        });
      await deps.audit(
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
    const auth = await deps.system(request, reply);
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
    await deps.audit(
      prisma,
      request,
      auth,
      before.organizationId,
      'twilio_limited_test.rollback',
      id,
      { reason: parsed.data.reason, status: 'requested' },
    );
    return reply.code(202).send({ authorization });
  });
}
