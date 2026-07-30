import type { PrismaClient } from '@sales-ai/database';

export async function createUpcomingAppointmentNotifications(
  prisma: PrismaClient,
  now: Date,
  batchSize: number,
) {
  const upcoming = await prisma.appointment.findMany({
    where: {
      status: 'confirmed',
      startAt: { gt: now, lte: new Date(now.getTime() + 30 * 60_000) },
    },
    select: { id: true, organizationId: true, assigneeUserId: true },
    take: Math.min(batchSize, 1000),
  });
  for (const row of upcoming)
    await prisma.followupNotification.upsert({
      where: { dedupeKey: `appointment-upcoming:${row.id}` },
      create: {
        organizationId: row.organizationId,
        userId: row.assigneeUserId,
        type: 'appointment_upcoming',
        dedupeKey: `appointment-upcoming:${row.id}`,
      },
      update: {},
    });
  return upcoming.length;
}
