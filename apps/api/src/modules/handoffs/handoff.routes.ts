import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { UserRole, type PrismaClient } from '@sales-ai/database';
import {
  handoffFeedbackSchema,
  handoffFinalizeSchema,
  handoffSettingsSchema,
  type ApiEnv,
} from '@sales-ai/validation';
import type { AuthContext } from '../../types.js';
import { requestMetadata, writeAudit } from '../../audit.js';
import {
  fakeHandoffFixture,
  finalizeSalesHandoff,
} from './handoff-card/handoff-finalization.service.js';

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

export function registerHandoffRoutes(app: FastifyInstance, deps: Deps) {
  const { prisma } = deps;
  const readRoles = [UserRole.system_admin, UserRole.admin, UserRole.manager, UserRole.sales];
  const scopedCard = async (id: string, auth: AuthContext) =>
    prisma.salesHandoffCard.findFirst({
      where: {
        id,
        organizationId: auth.organizationId,
        ...(auth.role === UserRole.sales
          ? {
              OR: [
                { followupTaskId: null },
                {
                  followupTaskId: {
                    in: (
                      await prisma.humanFollowupTask.findMany({
                        where: { organizationId: auth.organizationId, assigneeUserId: auth.userId },
                        select: { id: true },
                      })
                    ).map((task) => task.id),
                  },
                },
              ],
            }
          : {}),
      },
    });
  const audit = (
    request: FastifyRequest,
    auth: AuthContext,
    action: string,
    entityId: string,
    afterData: unknown,
  ) =>
    writeAudit(prisma, {
      organizationId: auth.organizationId,
      userId: auth.userId,
      action,
      entityType: 'sales_handoff_card',
      entityId,
      afterData,
      ...requestMetadata(request),
    });

  app.get('/api/v1/sales-handoff-cards', async (request, reply) => {
    const auth = await deps.authorize(request, reply, readRoles);
    if (!auth) return;
    const assignedIds =
      auth.role === UserRole.sales
        ? (
            await prisma.humanFollowupTask.findMany({
              where: { organizationId: auth.organizationId, assigneeUserId: auth.userId },
              select: { id: true },
            })
          ).map((task) => task.id)
        : undefined;
    return {
      cards: await prisma.salesHandoffCard.findMany({
        where: {
          organizationId: auth.organizationId,
          ...(assignedIds ? { followupTaskId: { in: assignedIds } } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    };
  });
  app.get('/api/v1/sales-handoff-cards/:id', async (request, reply) => {
    const auth = await deps.authorize(request, reply, readRoles);
    if (!auth) return;
    const id = (request.params as { id: string }).id;
    const card = await scopedCard(id, auth);
    if (!card) return deps.error(reply, 404, 'NOT_FOUND', '引継ぎカードがありません');
    return {
      card,
      feedback: await prisma.salesHandoffFeedback.findMany({
        where: { organizationId: auth.organizationId, cardId: id },
        orderBy: { createdAt: 'asc' },
      }),
    };
  });
  app.post('/api/v1/sales-handoff-cards/:id/feedback', async (request, reply) => {
    const auth = await deps.authorize(request, reply, readRoles);
    if (!auth || !deps.verifyCsrf(request, reply, auth)) return;
    const id = (request.params as { id: string }).id;
    if (!(await scopedCard(id, auth)))
      return deps.error(reply, 404, 'NOT_FOUND', '引継ぎカードがありません');
    const input = handoffFeedbackSchema.parse(request.body);
    const feedback = await prisma.salesHandoffFeedback.create({
      data: { organizationId: auth.organizationId, cardId: id, userId: auth.userId, ...input },
    });
    await audit(request, auth, 'sales_handoff.feedback_added', id, {
      verdict: input.verdict,
      fieldCode: input.fieldCode,
      reasonCode: input.reasonCode,
    });
    return reply.code(201).send({ feedback });
  });
  app.post('/api/v1/sales-handoff-cards/:id/manual-review', async (request, reply) => {
    const auth = await deps.authorize(request, reply, [
      UserRole.system_admin,
      UserRole.admin,
      UserRole.manager,
    ]);
    if (!auth || !deps.verifyCsrf(request, reply, auth)) return;
    const id = (request.params as { id: string }).id;
    const card = await prisma.salesHandoffCard.findFirst({
      where: { id, organizationId: auth.organizationId },
    });
    if (!card) return deps.error(reply, 404, 'NOT_FOUND', '引継ぎカードがありません');
    const updated = await prisma.salesHandoffCard.update({
      where: { id },
      data: { status: 'finalized', finalizedAt: new Date() },
    });
    await audit(request, auth, 'sales_handoff.manual_review_completed', id, {
      status: updated.status,
    });
    return { card: updated };
  });
  app.get('/api/v1/conversation-quality', async (request, reply) => {
    const auth = await deps.authorize(request, reply, [
      UserRole.system_admin,
      UserRole.admin,
      UserRole.manager,
    ]);
    if (!auth) return;
    const [total, lowConfidence, feedback, incorrect] = await Promise.all([
      prisma.salesHandoffCard.count({ where: { organizationId: auth.organizationId } }),
      prisma.salesHandoffCard.count({
        where: { organizationId: auth.organizationId, confidenceBand: 'low' },
      }),
      prisma.salesHandoffFeedback.count({ where: { organizationId: auth.organizationId } }),
      prisma.salesHandoffFeedback.count({
        where: { organizationId: auth.organizationId, verdict: 'incorrect' },
      }),
    ]);
    return {
      total,
      lowConfidence,
      humanReviewRate: total ? lowConfidence / total : 0,
      feedbackCount: feedback,
      incorrectRate: feedback ? incorrect / feedback : 0,
    };
  });
  app.get('/api/v1/handoff-settings', async (request, reply) => {
    const auth = await deps.authorize(request, reply, [UserRole.system_admin, UserRole.admin]);
    if (!auth) return;
    return {
      settings: await prisma.handoffSetting.findMany({
        where: { organizationId: auth.organizationId },
        orderBy: { version: 'desc' },
      }),
    };
  });
  app.post('/api/v1/handoff-settings', async (request, reply) => {
    const auth = await deps.authorize(request, reply, [UserRole.system_admin, UserRole.admin]);
    if (!auth || !deps.verifyCsrf(request, reply, auth)) return;
    const input = handoffSettingsSchema.parse(request.body);
    const latest = await prisma.handoffSetting.findFirst({
      where: { organizationId: auth.organizationId },
      orderBy: { version: 'desc' },
    });
    const setting = await prisma.handoffSetting.create({
      data: {
        organizationId: auth.organizationId,
        version: (latest?.version ?? 0) + 1,
        createdBy: auth.userId,
        allowedCodes: input.allowedCodes,
        scoreRules: input.scoreRules,
      },
    });
    return reply.code(201).send({ setting });
  });
  for (const action of ['validate', 'publish'] as const)
    app.post(`/api/v1/handoff-settings/:id/${action}`, async (request, reply) => {
      const auth = await deps.authorize(request, reply, [UserRole.system_admin, UserRole.admin]);
      if (!auth || !deps.verifyCsrf(request, reply, auth)) return;
      const id = (request.params as { id: string }).id;
      const setting = await prisma.handoffSetting.findFirst({
        where: { id, organizationId: auth.organizationId },
      });
      if (!setting) return deps.error(reply, 404, 'NOT_FOUND', '設定がありません');
      if (action === 'publish')
        await prisma.handoffSetting.updateMany({
          where: { organizationId: auth.organizationId, status: 'published' },
          data: { status: 'archived' },
        });
      return {
        setting: await prisma.handoffSetting.update({
          where: { id },
          data:
            action === 'publish'
              ? { status: 'published', publishedBy: auth.userId, publishedAt: new Date() }
              : { status: 'validated' },
        }),
      };
    });
  app.post('/api/v1/fake-sales-handoff/simulate', async (request, reply) => {
    if (deps.env.NODE_ENV === 'production')
      return deps.error(reply, 404, 'NOT_FOUND', '利用できません');
    const auth = await deps.authorize(request, reply, [
      UserRole.system_admin,
      UserRole.admin,
      UserRole.manager,
    ]);
    if (!auth || !deps.verifyCsrf(request, reply, auth)) return;
    const body = request.body as {
      fixture?: string;
      realtimeSessionId?: string;
      companyId?: string;
      contactId?: string;
    };
    if (!body.realtimeSessionId || !body.companyId)
      return deps.error(reply, 400, 'VALIDATION_ERROR', '対象を指定してください');
    const input = handoffFinalizeSchema.parse({
      ...fakeHandoffFixture(body.fixture ?? 'warm'),
      realtimeSessionId: body.realtimeSessionId,
      companyId: body.companyId,
      contactId: body.contactId,
    });
    const card = await finalizeSalesHandoff(
      prisma,
      input,
      deps.env.HANDOFF_RETENTION_DAYS,
      auth.userId,
    );
    await audit(request, auth, 'sales_handoff.finalized', card.id, {
      status: card.status,
      source: card.source,
      recommendedNextAction: card.recommendedNextAction,
      scoreReasonCodes: card.scoreReasonCodes,
    });
    return { card, externalCalls: 0, aiHandoffEnabled: deps.env.AI_HANDOFF_ENABLED };
  });
}
