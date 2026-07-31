import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { UserRole, type PrismaClient } from '@sales-ai/database';
import {
  fakeRealtimeSimulationSchema,
  followupAssignSchema,
  followupCompleteSchema,
  followupAttemptSchema,
  followupSnoozeSchema,
  followupVersionSchema,
  fakeZoomCallSchema,
  followupAssignmentRuleSchema,
  reasonSchema,
  type ApiEnv,
} from '@sales-ai/validation';
import type { AuthContext } from './types.js';
import { runFakeRealtimeSimulation } from './stage4b2-services.js';
import { registerRealtimeSessionRoutes } from './modules/realtime/realtime-session/realtime-session.routes.js';
import { requestMetadata, writeAudit } from './audit.js';
import { createHmac } from 'node:crypto';
import { verifyZoomWebhook } from '@sales-ai/human-calling-provider';
import {
  assignFollowup,
  ensureHumanFollowupAllowed,
  followupDashboard,
  runFakeZoomMatch,
  recordFollowupAttempt,
  transitionFollowup,
} from './stage4c-services.js';

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
export function registerStage4B2Routes(app: FastifyInstance, deps: Deps) {
  const { prisma, env } = deps;
  const mutate = async (request: FastifyRequest, reply: FastifyReply, roles: UserRole[]) => {
    const auth = await deps.authorize(request, reply, roles);
    if (!auth || !deps.verifyCsrf(request, reply, auth)) return;
    return auth;
  };
  const audit = (
    request: FastifyRequest,
    auth: AuthContext,
    action: string,
    entityType: string,
    entityId: string,
    afterData: Record<string, unknown>,
  ) =>
    writeAudit(prisma, {
      organizationId: auth.organizationId,
      userId: auth.userId,
      action,
      entityType,
      entityId,
      afterData,
      ...requestMetadata(request),
    });
  registerRealtimeSessionRoutes(app, deps);
  app.post('/api/v1/realtime-simulations', async (request, reply) => {
    if (env.NODE_ENV === 'production') return reply.code(404).send();
    const auth = await mutate(request, reply, [UserRole.system_admin]);
    if (!auth) return;
    const parsed = fakeRealtimeSimulationSchema.safeParse(request.body);
    if (!parsed.success) return deps.error(reply, 400, 'VALIDATION_ERROR', parsed.error.message);
    const session = await runFakeRealtimeSimulation(prisma, {
      organizationId: auth.organizationId,
      userId: auth.userId,
      ...parsed.data,
    });
    return reply.code(201).send({ session });
  });
  app.get('/api/v1/human-followup-tasks', async (request, reply) => {
    const auth = await deps.authorize(request, reply, [
      UserRole.system_admin,
      UserRole.admin,
      UserRole.manager,
      UserRole.sales,
    ]);
    if (!auth) return;
    return {
      tasks: await prisma.humanFollowupTask.findMany({
        where: {
          organizationId: auth.organizationId,
          ...(auth.role === UserRole.sales ? { assigneeUserId: auth.userId } : {}),
        },
        orderBy: [{ priority: 'asc' }, { dueAt: 'asc' }, { createdAt: 'desc' }],
        take: 100,
      }),
    };
  });
  app.get('/api/v1/human-followup-tasks/:id', async (request, reply) => {
    const auth = await deps.authorize(request, reply, [
      UserRole.system_admin,
      UserRole.admin,
      UserRole.manager,
      UserRole.sales,
    ]);
    if (!auth) return;
    const id = (request.params as { id: string }).id;
    const task = await prisma.humanFollowupTask.findFirst({
      where: {
        id,
        organizationId: auth.organizationId,
        ...(auth.role === UserRole.sales ? { assigneeUserId: auth.userId } : {}),
      },
    });
    if (!task) return deps.error(reply, 404, 'NOT_FOUND', 'タスクがありません');
    if (!task.firstOpenedAt)
      await prisma.humanFollowupTask.updateMany({
        where: { id: task.id, firstOpenedAt: null },
        data: { firstOpenedAt: new Date() },
      });
    return { task };
  });
  app.post('/api/v1/human-followup-tasks/:id/assign', async (request, reply) => {
    const auth = await mutate(request, reply, [
      UserRole.system_admin,
      UserRole.admin,
      UserRole.manager,
    ]);
    if (!auth) return;
    const parsed = followupAssignSchema.safeParse(request.body);
    if (!parsed.success) return deps.error(reply, 400, 'VALIDATION_ERROR', parsed.error.message);
    const id = (request.params as { id: string }).id;
    let task;
    try {
      task = await assignFollowup(prisma, {
        organizationId: auth.organizationId,
        taskId: id,
        actorUserId: auth.userId,
        actorRole: auth.role,
        ...parsed.data,
      });
    } catch {
      return deps.error(reply, 409, 'FOLLOWUP_CONFLICT', '割当条件またはversionを確認してください');
    }
    await audit(request, auth, 'human_followup.assigned', 'human_followup_task', id, {
      assigneeUserId: parsed.data.assigneeUserId,
    });
    return { task };
  });
  const selfTransition = (path: string, action: string, from: string[], status: string) =>
    app.post(path, async (request, reply) => {
      const auth = await mutate(request, reply, [UserRole.sales]);
      if (!auth) return;
      const parsed = followupVersionSchema.safeParse(request.body);
      if (!parsed.success) return deps.error(reply, 400, 'VALIDATION_ERROR', parsed.error.message);
      const id = (request.params as { id: string }).id;
      const owned = await prisma.humanFollowupTask.findFirst({
        where: { id, organizationId: auth.organizationId, assigneeUserId: auth.userId },
      });
      if (!owned)
        return deps.error(reply, 404, 'NOT_FOUND', '自分に割り当てられたタスクではありません');
      try {
        const task = await transitionFollowup(prisma, {
          organizationId: auth.organizationId,
          taskId: id,
          version: parsed.data.version,
          from,
          data: {
            status,
            ...(status === 'in_progress'
              ? { firstOpenedAt: owned.firstOpenedAt ?? new Date() }
              : {}),
          },
        });
        await audit(request, auth, action, 'human_followup_task', id, { status });
        return { task };
      } catch {
        return deps.error(reply, 409, 'FOLLOWUP_VERSION_CONFLICT', 'タスクが更新されています');
      }
    });
  selfTransition(
    '/api/v1/human-followup-tasks/:id/accept',
    'human_followup.accepted',
    ['assigned'],
    'assigned',
  );
  selfTransition(
    '/api/v1/human-followup-tasks/:id/start',
    'human_followup.started',
    ['assigned', 'open', 'snoozed'],
    'in_progress',
  );
  app.post('/api/v1/human-followup-tasks/:id/snooze', async (request, reply) => {
    const auth = await mutate(request, reply, [UserRole.sales]);
    if (!auth) return;
    const parsed = followupSnoozeSchema.safeParse(request.body);
    if (!parsed.success || parsed.data.until <= new Date())
      return deps.error(reply, 400, 'VALIDATION_ERROR', '将来の再開時刻が必要です');
    const id = (request.params as { id: string }).id;
    const owned = await prisma.humanFollowupTask.findFirst({
      where: { id, organizationId: auth.organizationId, assigneeUserId: auth.userId },
    });
    if (!owned) return deps.error(reply, 404, 'NOT_FOUND', 'タスクがありません');
    try {
      const task = await transitionFollowup(prisma, {
        organizationId: auth.organizationId,
        taskId: id,
        version: parsed.data.version,
        from: ['assigned', 'in_progress', 'open'],
        data: { status: 'snoozed', snoozedUntil: parsed.data.until },
      });
      return { task };
    } catch {
      return deps.error(reply, 409, 'FOLLOWUP_VERSION_CONFLICT', 'タスクが更新されています');
    }
  });
  app.post('/api/v1/human-followup-tasks/:id/record-attempt', async (request, reply) => {
    const auth = await mutate(request, reply, [UserRole.sales]);
    if (!auth) return;
    const parsed = followupAttemptSchema.safeParse(request.body);
    if (!parsed.success) return deps.error(reply, 400, 'VALIDATION_ERROR', parsed.error.message);
    const id = (request.params as { id: string }).id;
    try {
      await ensureHumanFollowupAllowed(prisma, {
        organizationId: auth.organizationId,
        taskId: id,
        userId: auth.userId,
      });
      const result = await recordFollowupAttempt(prisma, {
        organizationId: auth.organizationId,
        taskId: id,
        ...parsed.data,
      });
      return { ...result, outboundStarted: false };
    } catch (cause) {
      return deps.error(
        reply,
        409,
        cause instanceof Error ? cause.message : 'FOLLOWUP_REJECTED',
        '折り返し条件を満たしていません',
      );
    }
  });
  app.post('/api/v1/human-followup-tasks/:id/complete', async (request, reply) => {
    const auth = await mutate(request, reply, [
      UserRole.system_admin,
      UserRole.admin,
      UserRole.manager,
      UserRole.sales,
    ]);
    if (!auth) return;
    const parsed = followupCompleteSchema.safeParse(request.body);
    if (!parsed.success) return deps.error(reply, 400, 'VALIDATION_ERROR', parsed.error.message);
    const id = (request.params as { id: string }).id;
    const owned = await prisma.humanFollowupTask.findFirst({
      where: {
        id,
        organizationId: auth.organizationId,
        ...(auth.role === UserRole.sales ? { assigneeUserId: auth.userId } : {}),
      },
    });
    if (!owned) return deps.error(reply, 404, 'NOT_FOUND', 'タスクがありません');
    let task;
    try {
      task = await transitionFollowup(prisma, {
        organizationId: auth.organizationId,
        taskId: id,
        version: parsed.data.version,
        from: ['open', 'assigned', 'in_progress', 'contacted'],
        data: {
          status: 'completed',
          outcomeCode: parsed.data.outcomeCode,
          nextActionCode: parsed.data.nextActionCode,
          nextActionAt: parsed.data.nextActionAt,
          note: parsed.data.note,
          completedAt: new Date(),
        },
      });
    } catch {
      return deps.error(reply, 409, 'FOLLOWUP_VERSION_CONFLICT', 'タスクが更新されています');
    }
    await audit(request, auth, 'human_followup.completed', 'human_followup_task', id, {
      outcomeCode: parsed.data.outcomeCode,
    });
    return { task };
  });
  app.get('/api/v1/human-followup-dashboard', async (request, reply) => {
    const auth = await deps.authorize(request, reply, [
      UserRole.system_admin,
      UserRole.admin,
      UserRole.manager,
    ]);
    if (!auth) return;
    const to = new Date();
    const from = new Date(to.getTime() - 30 * 86_400_000);
    return followupDashboard(prisma, auth.organizationId, from, to);
  });
  app.get('/api/v1/followup-assignment-rules', async (request, reply) => {
    const auth = await deps.authorize(request, reply, [
      UserRole.system_admin,
      UserRole.admin,
      UserRole.manager,
    ]);
    if (!auth) return;
    return {
      rules: await prisma.followupAssignmentRule.findMany({
        where: { organizationId: auth.organizationId, active: true },
      }),
    };
  });
  app.post('/api/v1/followup-assignment-rules', async (request, reply) => {
    const auth = await mutate(request, reply, [UserRole.system_admin, UserRole.admin]);
    if (!auth) return;
    const parsed = followupAssignmentRuleSchema.safeParse(request.body);
    if (!parsed.success) return deps.error(reply, 400, 'VALIDATION_ERROR', parsed.error.message);
    if (parsed.data.teamId) {
      const team = await prisma.team.findFirst({
        where: { id: parsed.data.teamId, organizationId: auth.organizationId, status: 'active' },
      });
      if (!team) return deps.error(reply, 409, 'TEAM_INVALID', '同一組織の有効チームが必要です');
    }
    if (parsed.data.fixedAssigneeId) {
      const user = await prisma.user.findFirst({
        where: {
          id: parsed.data.fixedAssigneeId,
          organizationId: auth.organizationId,
          status: 'active',
          role: 'sales',
        },
      });
      if (!user) return deps.error(reply, 409, 'ASSIGNEE_INVALID', '有効な営業担当者が必要です');
    }
    const existing = await prisma.followupAssignmentRule.findFirst({
      where: { organizationId: auth.organizationId, campaignId: parsed.data.campaignId ?? null },
    });
    const rule = existing
      ? await prisma.followupAssignmentRule.update({
          where: { id: existing.id },
          data: parsed.data,
        })
      : await prisma.followupAssignmentRule.create({
          data: { organizationId: auth.organizationId, ...parsed.data },
        });
    await audit(
      request,
      auth,
      'followup_assignment_rule.updated',
      'followup_assignment_rule',
      rule.id,
      {
        mode: rule.mode,
        teamId: rule.teamId,
        campaignId: rule.campaignId,
        fixedAssigneeId: rule.fixedAssigneeId,
      },
    );
    return { rule };
  });
  app.post('/api/v1/fake-zoom-phone/call', async (request, reply) => {
    if (env.NODE_ENV === 'production') return reply.code(404).send();
    const auth = await mutate(request, reply, [UserRole.system_admin]);
    if (!auth) return;
    const parsed = fakeZoomCallSchema.safeParse(request.body);
    if (!parsed.success) return deps.error(reply, 400, 'VALIDATION_ERROR', parsed.error.message);
    return runFakeZoomMatch(prisma, env, { organizationId: auth.organizationId, ...parsed.data });
  });
  app.post('/api/v1/zoom-phone/webhook', { config: { rawBody: true } }, async (request, reply) => {
    if (!env.ZOOM_PHONE_INTEGRATION_ENABLED || !env.ZOOM_WEBHOOK_SECRET_TOKEN)
      return reply.code(404).send();
    const timestamp = request.headers['x-zm-request-timestamp'];
    const signature = request.headers['x-zm-signature'];
    const raw = request.rawBody;
    if (typeof timestamp !== 'string' || typeof signature !== 'string' || !Buffer.isBuffer(raw))
      return reply.code(403).send();
    const verified = verifyZoomWebhook({
      timestamp,
      signature,
      rawBody: raw,
      secret: env.ZOOM_WEBHOOK_SECRET_TOKEN,
    });
    if (!verified.valid) return reply.code(403).send();
    const body = request.body as { event?: unknown; payload?: { plainToken?: unknown } };
    if (body.event === 'endpoint.url_validation' && typeof body.payload?.plainToken === 'string')
      return {
        plainToken: body.payload.plainToken,
        encryptedToken: createHmac('sha256', env.ZOOM_WEBHOOK_SECRET_TOKEN)
          .update(body.payload.plainToken)
          .digest('hex'),
      };
    await prisma.zoomPhoneEvent.upsert({
      where: { eventFingerprint: verified.eventFingerprint },
      create: {
        eventFingerprint: verified.eventFingerprint,
        occurredAt: new Date(Number(timestamp) * 1000),
        sanitizedMetadata: { eventType: typeof body.event === 'string' ? body.event : 'unknown' },
      },
      update: {},
    });
    return reply.code(202).send({ accepted: true });
  });
  app.post('/api/v1/human-followup-tasks/:id/cancel', async (request, reply) => {
    const auth = await mutate(request, reply, [
      UserRole.system_admin,
      UserRole.admin,
      UserRole.manager,
    ]);
    if (!auth) return;
    const parsed = reasonSchema.safeParse(request.body);
    if (!parsed.success) return deps.error(reply, 400, 'REASON_REQUIRED', '理由が必要です');
    const id = (request.params as { id: string }).id;
    const result = await prisma.humanFollowupTask.updateMany({
      where: {
        id,
        organizationId: auth.organizationId,
        status: { notIn: ['completed', 'cancelled'] },
      },
      data: { status: 'cancelled', outcomeCode: 'cancelled_by_operator', completedAt: new Date() },
    });
    if (!result.count) return deps.error(reply, 404, 'NOT_FOUND', '取消可能なタスクがありません');
    await audit(request, auth, 'human_followup.cancelled', 'human_followup_task', id, {
      reason: parsed.data.reason,
    });
    return { cancelled: true };
  });
}
