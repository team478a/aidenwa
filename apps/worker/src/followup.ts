import type { PrismaClient } from '@sales-ai/database';

export async function reopenSnoozedFollowups(prisma: PrismaClient, now = new Date()) {
  const tasks = await prisma.humanFollowupTask.findMany({
    where: { status: 'snoozed', snoozedUntil: { lte: now } },
    select: { id: true, organizationId: true, assigneeUserId: true, version: true },
    take: 500,
  });
  for (const task of tasks)
    await prisma.$transaction([
      prisma.humanFollowupTask.updateMany({
        where: { id: task.id, status: 'snoozed', version: task.version },
        data: {
          status: task.assigneeUserId ? 'assigned' : 'open',
          snoozedUntil: null,
          version: { increment: 1 },
        },
      }),
      prisma.followupNotification.upsert({
        where: { dedupeKey: `snooze-ended:${task.id}:${task.version}` },
        create: {
          organizationId: task.organizationId,
          userId: task.assigneeUserId,
          taskId: task.id,
          type: 'snooze_ended',
          dedupeKey: `snooze-ended:${task.id}:${task.version}`,
        },
        update: {},
      }),
    ]);
  return tasks.length;
}
