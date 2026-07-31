import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { Prisma, type PrismaClient, UserRole } from '@sales-ai/database';
import { fixtureSchema, idParamsSchema } from '@sales-ai/validation';
import { requestMetadata, writeAudit } from './audit.js';
import { registerAiAgentRoutes } from './modules/ai-agents/ai-agent.routes.js';
import { registerCampaignRoutes } from './modules/campaigns/campaign.routes.js';
import { registerKnowledgeRoutes } from './modules/knowledge/knowledge.routes.js';
import { enqueueOutbox } from './outbox.js';
import { registerProductRoutes } from './modules/products/product.routes.js';
import { registerScenarioRoutes } from './modules/scenarios/scenario.routes.js';
import { targetEligibility } from './stage3-services.js';
import type { AuthContext } from './types.js';

type Deps = {
  prisma: PrismaClient;
  redisUrl: string;
  nodeEnv: string;
  authenticate(request: FastifyRequest, reply: FastifyReply): Promise<AuthContext | undefined>;
  authorize(
    request: FastifyRequest,
    reply: FastifyReply,
    roles: readonly UserRole[],
  ): Promise<AuthContext | undefined>;
  verifyCsrf(request: FastifyRequest, reply: FastifyReply, auth: AuthContext): boolean;
  error(reply: FastifyReply, code: number, key: string, message: string): unknown;
};

export function registerStage3Routes(app: FastifyInstance, deps: Deps) {
  const { prisma } = deps;
  async function read(request: FastifyRequest, reply: FastifyReply) {
    return deps.authenticate(request, reply);
  }
  async function manage(request: FastifyRequest, reply: FastifyReply) {
    const auth = await deps.authorize(request, reply, [UserRole.admin, UserRole.manager]);
    if (!auth || !deps.verifyCsrf(request, reply, auth)) return;
    return auth;
  }
  async function audit(
    request: FastifyRequest,
    auth: AuthContext,
    action: string,
    entityType: string,
    entityId: string,
    afterData?: unknown,
  ) {
    await writeAudit(prisma, {
      organizationId: auth.organizationId,
      userId: auth.userId,
      action,
      entityType,
      entityId,
      afterData,
      ...requestMetadata(request),
    });
  }
  registerProductRoutes(app, deps);
  registerAiAgentRoutes(app, deps);
  registerScenarioRoutes(app, deps);
  registerKnowledgeRoutes(app, deps);
  registerCampaignRoutes(app, deps);
  app.post('/api/v1/campaigns/:id/targets/preview', async (request, reply) =>
    targets(request, reply, false),
  );
  app.post('/api/v1/campaigns/:id/targets/materialize', async (request, reply) =>
    targets(request, reply, true),
  );
  app.get('/api/v1/campaigns/:id/targets', async (request, reply) => {
    const auth = await read(request, reply);
    if (!auth) return;
    const { id } = idParamsSchema.parse(request.params);
    return {
      targets: await prisma.campaignTarget.findMany({
        where: {
          campaignId: id,
          organizationId: auth.organizationId,
          ...(auth.role === UserRole.sales ? { ownerUserIdSnapshot: auth.userId } : {}),
        },
        orderBy: { createdAt: 'asc' },
        take: 1000,
      }),
    };
  });
  app.post('/api/v1/campaigns/:id/mock-calls/run-next', async (request, reply) => {
    const auth = await manage(request, reply);
    if (!auth) return;
    if (deps.nodeEnv === 'production')
      return deps.error(reply, 403, 'MOCK_DISABLED', 'productionではfixture指定できません');
    const { id } = idParamsSchema.parse(request.params);
    const { fixture } = fixtureSchema.parse(request.body ?? {});
    const campaign = await prisma.campaign.findFirst({
      where: { id, organizationId: auth.organizationId, status: 'running' },
    });
    if (!campaign)
      return deps.error(reply, 409, 'NOT_RUNNING', 'runningキャンペーンのみ実行できます');
    const target = await prisma.campaignTarget.findFirst({
      where: {
        campaignId: id,
        organizationId: auth.organizationId,
        status: { in: ['pending', 'retry_wait'] },
        eligibilityStatus: 'eligible',
      },
      orderBy: { priority: 'asc' },
    });
    if (!target) return deps.error(reply, 409, 'NO_TARGET', '実行対象がありません');
    const eligibility = await targetEligibility(
      prisma,
      auth.organizationId,
      target.companyId,
      target.phoneNumberId,
    );
    if (!eligibility.eligible) {
      await prisma.campaignTarget.update({
        where: { id: target.id },
        data: {
          status: 'excluded',
          eligibilityStatus: 'excluded',
          exclusionReason: eligibility.reason,
        },
      });
      return { dispatched: false, exclusionReason: eligibility.reason };
    }
    const idempotencyKey = `${id}:${target.id}:${target.attemptCount + 1}`;
    const job = await prisma.$transaction(async (tx) => {
      const queuedJob = await tx.callJob.upsert({
        where: { idempotencyKey },
        update: {},
        create: {
          organizationId: auth.organizationId,
          campaignId: id,
          campaignTargetId: target.id,
          idempotencyKey,
          fixture,
        },
      });
      await tx.campaignTarget.update({ where: { id: target.id }, data: { status: 'queued' } });
      await enqueueOutbox(tx, {
        organizationId: auth.organizationId,
        eventType: 'mock-call',
        aggregateType: 'call_job',
        aggregateId: queuedJob.id,
        payload: { callJobId: queuedJob.id, organizationId: auth.organizationId },
      });
      return queuedJob;
    });
    await audit(request, auth, 'mock_call.queued', 'call_job', job.id, {
      campaignId: id,
      targetId: target.id,
      fixture,
    });
    return reply.code(202).send({ callJob: job });
  });
  app.get('/api/v1/call-jobs', async (request, reply) => callRead(request, reply));
  app.get('/api/v1/call-jobs/:id', async (request, reply) => callRead(request, reply, true));
  app.post('/api/v1/call-jobs/:id/cancel', async (request, reply) => {
    const auth = await manage(request, reply);
    if (!auth) return;
    const { id } = idParamsSchema.parse(request.params);
    const result = await prisma.callJob.updateMany({
      where: {
        id,
        organizationId: auth.organizationId,
        status: { in: ['queued', 'reserved', 'dispatching'] },
      },
      data: { status: 'cancelled', cancelledAt: new Date() },
    });
    if (!result.count) return deps.error(reply, 409, 'INVALID_STATE', '取消できません');
    await audit(request, auth, 'mock_call.cancelled', 'call_job', id);
    return { status: 'cancelled' };
  });
  app.get('/api/v1/call-attempts/:id', async (request, reply) => {
    const auth = await read(request, reply);
    if (!auth) return;
    const { id } = idParamsSchema.parse(request.params);
    const attempt = await prisma.callAttempt.findFirst({
      where: {
        id,
        organizationId: auth.organizationId,
        ...(auth.role === UserRole.sales
          ? { job: { target: { ownerUserIdSnapshot: auth.userId } } }
          : {}),
      },
      include: { events: true, job: true },
    });
    if (!attempt) return deps.error(reply, 404, 'NOT_FOUND', '試行が見つかりません');
    return { callAttempt: attempt };
  });
  app.post('/api/v1/call-attempts/:id/outcome', async (request, reply) => {
    const auth = await deps.authenticate(request, reply);
    if (!auth || !deps.verifyCsrf(request, reply, auth)) return;
    const { id } = idParamsSchema.parse(request.params);
    const body = fixtureSchema.parse(request.body);
    const attempt = await prisma.callAttempt.findFirst({
      where: {
        id,
        organizationId: auth.organizationId,
        ...(auth.role === UserRole.sales
          ? { job: { target: { ownerUserIdSnapshot: auth.userId } } }
          : {}),
      },
    });
    if (!attempt) return deps.error(reply, 404, 'NOT_FOUND', '試行が見つかりません');
    await prisma.callAttempt.update({
      where: { id },
      data: { resultCode: body.fixture, summary: `Manual mock outcome: ${body.fixture}` },
    });
    await audit(request, auth, 'mock_call.manual_outcome', 'call_attempt', id, {
      resultCode: body.fixture,
    });
    return { status: 'updated' };
  });

  async function targets(request: FastifyRequest, reply: FastifyReply, materialize: boolean) {
    const auth = await manage(request, reply);
    if (!auth) return;
    const { id } = idParamsSchema.parse(request.params);
    const campaign = await prisma.campaign.findFirst({
      where: { id, organizationId: auth.organizationId, status: 'draft' },
    });
    if (!campaign) return deps.error(reply, 409, 'INVALID_STATE', 'draftのみ対象化できます');
    const members = await prisma.salesListCompany.findMany({
      where: { salesListId: campaign.salesListId, removedAt: null },
      include: {
        company: { include: { phoneNumbers: { where: { isPrimary: true, isDeleted: false } } } },
      },
      take: 10000,
    });
    const rows = [];
    for (const member of members) {
      const phone = member.company.phoneNumbers[0];
      const eligibility = await targetEligibility(
        prisma,
        auth.organizationId,
        member.companyId,
        phone?.id,
      );
      rows.push({
        companyId: member.companyId,
        phoneNumberId: phone?.id ?? null,
        ownerUserIdSnapshot: member.company.ownerUserId,
        eligible: eligibility.eligible,
        exclusionReason: eligibility.reason,
      });
    }
    if (materialize) {
      await prisma.campaignTarget.deleteMany({ where: { campaignId: id } });
      for (const row of rows)
        await prisma.campaignTarget.create({
          data: {
            organizationId: auth.organizationId,
            campaignId: id,
            companyId: row.companyId,
            phoneNumberId: row.phoneNumberId,
            ownerUserIdSnapshot: row.ownerUserIdSnapshot,
            status: row.eligible ? 'pending' : 'excluded',
            eligibilityStatus: row.eligible ? 'eligible' : 'excluded',
            exclusionReason: row.exclusionReason,
          },
        });
      await audit(request, auth, 'campaign.targets_materialized', 'campaign', id, {
        total: rows.length,
        eligible: rows.filter((r) => r.eligible).length,
        excluded: rows.filter((r) => !r.eligible).length,
      });
    }
    return {
      targets: rows,
      summary: {
        total: rows.length,
        eligible: rows.filter((r) => r.eligible).length,
        excluded: rows.filter((r) => !r.eligible).length,
      },
    };
  }
  async function callRead(request: FastifyRequest, reply: FastifyReply, detail = false) {
    const auth = await read(request, reply);
    if (!auth) return;
    const where: Prisma.CallJobWhereInput = {
      organizationId: auth.organizationId,
      ...(auth.role === UserRole.sales ? { target: { ownerUserIdSnapshot: auth.userId } } : {}),
    };
    if (detail) {
      const { id } = idParamsSchema.parse(request.params);
      const callJob = await prisma.callJob.findFirst({
        where: { ...where, id },
        include: { attempts: { include: { events: true } }, target: { include: {} } },
      });
      if (!callJob) return deps.error(reply, 404, 'NOT_FOUND', 'ジョブが見つかりません');
      return { callJob };
    }
    return {
      callJobs: await prisma.callJob.findMany({
        where,
        include: { attempts: true, target: true },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
    };
  }
}
