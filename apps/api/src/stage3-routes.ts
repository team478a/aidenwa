import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { Prisma, type PrismaClient, UserRole } from '@sales-ai/database';
import { campaignSchema, fixtureSchema, idParamsSchema } from '@sales-ai/validation';
import { requestMetadata, writeAudit } from './audit.js';
import { registerAiAgentRoutes } from './modules/ai-agents/ai-agent.routes.js';
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

  app.get('/api/v1/campaigns', async (request, reply) => campaignRead(request, reply));
  app.get('/api/v1/campaigns/:id', async (request, reply) => campaignRead(request, reply, true));
  app.post('/api/v1/campaigns', async (request, reply) => {
    const auth = await manage(request, reply);
    if (!auth) return;
    const input = campaignSchema.parse(request.body);
    if (!(await campaignReferences(auth.organizationId, input)))
      return deps.error(
        reply,
        400,
        'CROSS_OR_UNPUBLISHED',
        '公開済みの同一組織設定を指定してください',
      );
    const campaign = await prisma.campaign.create({
      data: { organizationId: auth.organizationId, createdBy: auth.userId, ...input },
    });
    await audit(request, auth, 'campaign.created', 'campaign', campaign.id, {
      name: campaign.name,
    });
    return reply.code(201).send({ campaign });
  });
  app.patch('/api/v1/campaigns/:id', async (request, reply) => {
    const auth = await manage(request, reply);
    if (!auth) return;
    const { id } = idParamsSchema.parse(request.params);
    const input = campaignSchema
      .partial()
      .omit({
        productVersionId: true,
        aiAgentVersionId: true,
        scenarioVersionId: true,
        salesListId: true,
      })
      .parse(request.body);
    const result = await prisma.campaign.updateMany({
      where: { id, organizationId: auth.organizationId, status: 'draft' },
      data: input,
    });
    if (!result.count) return deps.error(reply, 409, 'INVALID_STATE', 'draftのみ編集できます');
    return { status: 'updated' };
  });
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
  app.post('/api/v1/campaigns/:id/validate', async (request, reply) =>
    transition(request, reply, 'validate'),
  );
  app.post('/api/v1/campaigns/:id/approve', async (request, reply) =>
    transition(request, reply, 'approve'),
  );
  app.post('/api/v1/campaigns/:id/start', async (request, reply) =>
    transition(request, reply, 'start'),
  );
  app.post('/api/v1/campaigns/:id/pause', async (request, reply) =>
    transition(request, reply, 'pause'),
  );
  app.post('/api/v1/campaigns/:id/resume', async (request, reply) =>
    transition(request, reply, 'resume'),
  );
  app.post('/api/v1/campaigns/:id/cancel', async (request, reply) =>
    transition(request, reply, 'cancel'),
  );
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

  async function campaignReferences(
    org: string,
    input: {
      productVersionId: string;
      aiAgentVersionId: string;
      scenarioVersionId: string;
      salesListId: string;
      knowledgeBaseId?: string | null;
    },
  ) {
    const [p, a, s, l, k] = await Promise.all([
      prisma.productVersion.count({
        where: { id: input.productVersionId, organizationId: org, status: 'published' },
      }),
      prisma.aiAgentVersion.count({
        where: { id: input.aiAgentVersionId, organizationId: org, status: 'published' },
      }),
      prisma.scenarioVersion.count({
        where: {
          id: input.scenarioVersionId,
          organizationId: org,
          status: 'published',
          validationStatus: 'valid',
        },
      }),
      prisma.salesList.count({
        where: { id: input.salesListId, organizationId: org, isDeleted: false },
      }),
      input.knowledgeBaseId
        ? prisma.knowledgeBase.count({ where: { id: input.knowledgeBaseId, organizationId: org } })
        : Promise.resolve(1),
    ]);
    return p * a * s * l * k > 0;
  }
  async function campaignRead(request: FastifyRequest, reply: FastifyReply, detail = false) {
    const auth = await read(request, reply);
    if (!auth) return;
    if (detail) {
      const { id } = idParamsSchema.parse(request.params);
      const campaign = await prisma.campaign.findFirst({
        where: { id, organizationId: auth.organizationId },
        include: {
          targets: {
            where: auth.role === UserRole.sales ? { ownerUserIdSnapshot: auth.userId } : {},
            take: 1000,
          },
          jobs: { include: { attempts: true }, take: 100 },
        },
      });
      if (!campaign) return deps.error(reply, 404, 'NOT_FOUND', 'キャンペーンが見つかりません');
      return { campaign };
    }
    return {
      campaigns: await prisma.campaign.findMany({
        where: { organizationId: auth.organizationId },
        orderBy: { updatedAt: 'desc' },
        take: 100,
      }),
    };
  }
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
  async function transition(
    request: FastifyRequest,
    reply: FastifyReply,
    action: 'validate' | 'approve' | 'start' | 'pause' | 'resume' | 'cancel',
  ) {
    const auth = await manage(request, reply);
    if (!auth) return;
    const { id } = idParamsSchema.parse(request.params);
    const campaign = await prisma.campaign.findFirst({
      where: { id, organizationId: auth.organizationId },
    });
    if (!campaign) return deps.error(reply, 404, 'NOT_FOUND', 'キャンペーンが見つかりません');
    const allowed: Record<typeof action, string[]> = {
      validate: ['draft'],
      approve: ['ready'],
      start: ['ready'],
      pause: ['running'],
      resume: ['paused'],
      cancel: ['draft', 'ready', 'running', 'paused'],
    };
    if (!allowed[action].includes(campaign.status))
      return deps.error(reply, 409, 'INVALID_STATE', '状態遷移が不正です');
    if ((action === 'start' || action === 'resume') && !campaign.approvedAt)
      return deps.error(reply, 409, 'APPROVAL_REQUIRED', '開始前に承認が必要です');
    if (action === 'validate') {
      const refs = await campaignReferences(auth.organizationId, campaign);
      const eligible = await prisma.campaignTarget.count({
        where: { campaignId: id, eligibilityStatus: 'eligible' },
      });
      if (!refs || !eligible)
        return deps.error(reply, 409, 'VALIDATION_FAILED', '公開設定と適格対象が必要です');
    }
    const status =
      action === 'validate'
        ? 'ready'
        : action === 'approve'
          ? 'ready'
          : action === 'start' || action === 'resume'
            ? 'running'
            : action === 'pause'
              ? 'paused'
              : 'cancelled';
    const updated = await prisma.campaign.update({
      where: { id },
      data: {
        status,
        ...(action === 'approve' ? { approvedBy: auth.userId, approvedAt: new Date() } : {}),
        ...(action === 'start' ? { startedAt: new Date() } : {}),
        ...(action === 'pause' ? { pausedAt: new Date() } : {}),
      },
    });
    if (action === 'cancel')
      await prisma.campaignTarget.updateMany({
        where: { campaignId: id, status: { notIn: ['completed', 'excluded'] } },
        data: { status: 'cancelled' },
      });
    await audit(request, auth, `campaign.${action}`, 'campaign', id, {
      from: campaign.status,
      to: status,
    });
    return { campaign: updated };
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
