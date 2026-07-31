import type { PrismaClient } from '@sales-ai/database';
import { transitionFollowup } from '../workflow/followup-state.service.js';

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
