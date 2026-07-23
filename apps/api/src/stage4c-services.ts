import { createHmac } from 'node:crypto';
import { inCallableWindow, type PrismaClient } from '@sales-ai/database';
import type { ApiEnv } from '@sales-ai/validation';
import { FakeZoomPhoneProvider, type FakeZoomFixture } from '@sales-ai/human-calling-provider';

const TERMINAL = ['completed', 'cancelled'];

export async function ensureHumanFollowupAllowed(
  prisma: PrismaClient,
  input: { organizationId: string; taskId: string; userId: string; now?: Date },
) {
  const now = input.now ?? new Date();
  const task = await prisma.humanFollowupTask.findFirst({
    where: { id: input.taskId, organizationId: input.organizationId },
  });
  if (!task || task.assigneeUserId !== input.userId) throw new Error('FOLLOWUP_NOT_ASSIGNED');
  if (TERMINAL.includes(task.status)) throw new Error('FOLLOWUP_TERMINAL');
  const phone = await prisma.phoneNumber.findFirst({
    where: { id: task.phoneNumberId, organizationId: input.organizationId, isDeleted: false },
  });
  if (!phone?.isCallable || !phone.isValid || phone.type === 'fax')
    throw new Error('PHONE_NOT_CALLABLE');
  const [optOut, stop, campaign] = await Promise.all([
    prisma.optOut.findFirst({
      where: {
        organizationId: input.organizationId,
        status: 'active',
        channel: { in: ['all', 'phone'] },
        OR: [
          { companyId: phone.companyId },
          { phoneNumberId: phone.id },
          ...(phone.contactId ? [{ contactId: phone.contactId }] : []),
          { normalizedPhoneSnapshot: phone.normalizedNumber },
        ],
      },
    }),
    prisma.emergencyStop.findFirst({
      where: {
        active: true,
        OR: [
          { scope: 'system' },
          { scope: 'organization', organizationId: input.organizationId },
          { scope: 'campaign', organizationId: input.organizationId, scopeId: task.campaignId },
          { scope: 'provider', organizationId: input.organizationId, scopeId: 'zoom_phone' },
        ],
      },
    }),
    prisma.campaign.findFirst({
      where: { id: task.campaignId, organizationId: input.organizationId },
    }),
  ]);
  if (optOut) throw new Error('OPT_OUT');
  if (stop) throw new Error('EMERGENCY_STOP_ACTIVE');
  if (
    !campaign ||
    !inCallableWindow(
      now,
      campaign.callableWeekdays as number[],
      campaign.callableStartTime,
      campaign.callableEndTime,
      campaign.timezone,
    )
  )
    throw new Error('OUTSIDE_CALLABLE_WINDOW');
  return { task, phone };
}

export async function transitionFollowup(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    taskId: string;
    version: number;
    from: string[];
    data: Record<string, unknown>;
  },
) {
  const result = await prisma.humanFollowupTask.updateMany({
    where: {
      id: input.taskId,
      organizationId: input.organizationId,
      version: input.version,
      status: { in: input.from },
    },
    data: { ...input.data, version: { increment: 1 } },
  });
  if (!result.count) throw new Error('FOLLOWUP_VERSION_CONFLICT');
  return prisma.humanFollowupTask.findUniqueOrThrow({ where: { id: input.taskId } });
}

export async function assignFollowup(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    taskId: string;
    assigneeUserId: string;
    version: number;
    actorUserId: string;
    actorRole: string;
  },
) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.taskId}, 0))`;
    const user = await tx.user.findFirst({
      where: {
        id: input.assigneeUserId,
        organizationId: input.organizationId,
        status: 'active',
        role: 'sales',
      },
    });
    if (!user) throw new Error('ASSIGNEE_INVALID');
    if (input.actorRole === 'manager') {
      const actor = await tx.user.findFirst({
        where: { id: input.actorUserId, organizationId: input.organizationId, status: 'active' },
        select: { teamId: true },
      });
      if (!actor?.teamId || actor.teamId !== user.teamId) throw new Error('MANAGER_TEAM_BOUNDARY');
    }
    const task = await transitionFollowup(tx as PrismaClient, {
      organizationId: input.organizationId,
      taskId: input.taskId,
      version: input.version,
      from: ['open', 'assigned', 'snoozed'],
      data: {
        status: 'assigned',
        assigneeUserId: user.id,
        assignedAt: new Date(),
        snoozedUntil: null,
      },
    });
    await tx.followupNotification.upsert({
      where: { dedupeKey: `assigned:${task.id}:${task.version}` },
      create: {
        organizationId: input.organizationId,
        userId: user.id,
        taskId: task.id,
        type: task.priority === 'urgent' ? 'urgent_assigned' : 'assigned',
        dedupeKey: `assigned:${task.id}:${task.version}`,
      },
      update: {},
    });
    return task;
  });
}

export async function autoAssignFollowup(
  prisma: PrismaClient,
  input: { organizationId: string; taskId: string; campaignId: string },
) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.organizationId}, 1))`;
    const rule = await tx.followupAssignmentRule.findFirst({
      where: {
        organizationId: input.organizationId,
        active: true,
        OR: [{ campaignId: input.campaignId }, { campaignId: null }],
      },
      orderBy: { campaignId: 'desc' },
    });
    if (!rule || rule.mode === 'none') return null;
    const where = {
      organizationId: input.organizationId,
      status: 'active' as const,
      role: 'sales' as const,
      ...(rule.mode === 'team' && rule.teamId ? { teamId: rule.teamId } : {}),
      ...(rule.mode === 'campaign_fixed' && rule.fixedAssigneeId
        ? { id: rule.fixedAssigneeId }
        : {}),
    };
    const users = await tx.user.findMany({ where, orderBy: { id: 'asc' } });
    if (!users.length) return null;
    const assignee = users[rule.mode === 'round_robin' ? rule.roundRobinCursor % users.length : 0]!;
    const task = await tx.humanFollowupTask.update({
      where: { id: input.taskId },
      data: {
        status: 'assigned',
        assigneeUserId: assignee.id,
        assignedAt: new Date(),
        version: { increment: 1 },
      },
    });
    if (rule.mode === 'round_robin')
      await tx.followupAssignmentRule.update({
        where: { id: rule.id },
        data: { roundRobinCursor: { increment: 1 } },
      });
    await tx.followupNotification.upsert({
      where: { dedupeKey: `auto-assigned:${task.id}:${task.version}` },
      create: {
        organizationId: input.organizationId,
        userId: assignee.id,
        taskId: task.id,
        type: task.priority === 'urgent' ? 'urgent_assigned' : 'assigned',
        dedupeKey: `auto-assigned:${task.id}:${task.version}`,
      },
      update: {},
    });
    return task;
  });
}

export async function runFakeZoomMatch(
  prisma: PrismaClient,
  env: ApiEnv,
  input: { organizationId: string; taskId: string; fixture: FakeZoomFixture },
) {
  const task = await prisma.humanFollowupTask.findFirst({
    where: { id: input.taskId, organizationId: input.organizationId },
  });
  if (!task) throw new Error('FOLLOWUP_NOT_FOUND');
  const provider = new FakeZoomPhoneProvider(input.fixture);
  const calls = (
    await provider.listCallLogs({
      from: new Date(Date.now() - env.ZOOM_PHONE_SYNC_LOOKBACK_MINUTES * 60_000),
      to: new Date(),
    })
  ).calls;
  const outbound = calls.filter((call) => call.direction === 'outbound');
  if (outbound.length !== 1) {
    await prisma.followupNotification.upsert({
      where: { dedupeKey: `zoom-ambiguous:${task.id}:${task.version}` },
      create: {
        organizationId: input.organizationId,
        taskId: task.id,
        type: 'zoom_match_ambiguous',
        dedupeKey: `zoom-ambiguous:${task.id}:${task.version}`,
      },
      update: {},
    });
    return { status: 'ambiguous', matched: false };
  }
  const call = outbound[0]!;
  const fingerprint = hmac(
    env.ZOOM_PHONE_FINGERPRINT_SECRET ?? 'stage4c-fake-fingerprint-secret-32chars',
    call.callFingerprint,
  );
  await prisma.humanFollowupTask.update({
    where: { id: task.id },
    data: {
      zoomCallFingerprint: fingerprint,
      firstAttemptedAt: task.firstAttemptedAt ?? call.startedAt,
      firstConnectedAt:
        call.result === 'connected'
          ? (task.firstConnectedAt ?? call.startedAt)
          : task.firstConnectedAt,
      attemptCount: { increment: 1 },
      status: call.result === 'connected' ? 'contacted' : 'in_progress',
      version: { increment: 1 },
    },
  });
  return { status: call.result, matched: true };
}

export async function recordFollowupAttempt(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    taskId: string;
    version: number;
    idempotencyKey: string;
    result: string;
  },
) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.followupAttempt.findUnique({
      where: {
        organizationId_idempotencyKey: {
          organizationId: input.organizationId,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
    if (existing)
      return {
        task: await tx.humanFollowupTask.findUniqueOrThrow({ where: { id: input.taskId } }),
        duplicate: true,
      };
    await tx.followupAttempt.create({
      data: {
        organizationId: input.organizationId,
        taskId: input.taskId,
        idempotencyKey: input.idempotencyKey,
        resultCode: input.result,
      },
    });
    const task = await transitionFollowup(tx as PrismaClient, {
      organizationId: input.organizationId,
      taskId: input.taskId,
      version: input.version,
      from: ['assigned', 'in_progress', 'contacted'],
      data: {
        status: input.result === 'connected' ? 'contacted' : 'in_progress',
        attemptCount: { increment: 1 },
        firstAttemptedAt: new Date(),
        ...(input.result === 'connected' ? { firstConnectedAt: new Date() } : {}),
      },
    });
    return { task, duplicate: false };
  });
}

export async function followupDashboard(
  prisma: PrismaClient,
  organizationId: string,
  from: Date,
  to: Date,
) {
  const tasks = await prisma.humanFollowupTask.findMany({
    where: { organizationId, createdAt: { gte: from, lte: to } },
    select: {
      status: true,
      outcomeCode: true,
      createdAt: true,
      firstAttemptedAt: true,
      firstConnectedAt: true,
      assigneeUserId: true,
      dueAt: true,
    },
  });
  const attempted = tasks.filter((task) => task.firstAttemptedAt);
  const connected = tasks.filter((task) => task.firstConnectedAt);
  const appointments = tasks.filter((task) => task.outcomeCode === 'appointment_booked');
  const responseMs = attempted.map(
    (task) => task.firstAttemptedAt!.getTime() - task.createdAt.getTime(),
  );
  return {
    period: { from, to },
    total: tasks.length,
    unassigned: tasks.filter((task) => !task.assigneeUserId && !TERMINAL.includes(task.status))
      .length,
    overdue: tasks.filter(
      (task) => task.dueAt && task.dueAt < new Date() && !TERMINAL.includes(task.status),
    ).length,
    attempted: attempted.length,
    connected: connected.length,
    connectionRate: attempted.length ? connected.length / attempted.length : null,
    appointments: appointments.length,
    appointmentRate: connected.length ? appointments.length / connected.length : null,
    averageFirstAttemptMs: responseMs.length
      ? Math.round(responseMs.reduce((a, b) => a + b, 0) / responseMs.length)
      : null,
  };
}
function hmac(secret: string, value: string) {
  return createHmac('sha256', secret).update(value).digest('hex');
}
