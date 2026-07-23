import type { PrismaClient } from '@sales-ai/database';

export async function maintainAppointments(
  prisma: PrismaClient,
  now = new Date(),
  batchSize = 500,
) {
  const expired = await prisma.appointment.findMany({
    where: { status: 'held', holdExpiresAt: { lte: now } },
    select: { id: true, organizationId: true, assigneeUserId: true },
    take: Math.min(batchSize, 1000),
  });
  for (const row of expired)
    await prisma.$transaction(async (tx) => {
      const changed = await tx.appointment.updateMany({
        where: { id: row.id, status: 'held', holdExpiresAt: { lte: now } },
        data: { status: 'expired', version: { increment: 1 } },
      });
      if (!changed.count) return;
      await tx.appointmentEvent.create({
        data: {
          organizationId: row.organizationId,
          appointmentId: row.id,
          type: 'expired',
          actorType: 'worker',
          reasonCode: 'hold_ttl',
          beforeStatus: 'held',
          afterStatus: 'expired',
        },
      });
      await tx.followupNotification.upsert({
        where: { dedupeKey: `appointment-expired:${row.id}` },
        create: {
          organizationId: row.organizationId,
          userId: row.assigneeUserId,
          type: 'appointment_hold_expired',
          dedupeKey: `appointment-expired:${row.id}`,
        },
        update: {},
      });
    });
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
  const oldEvents = await prisma.appointmentEvent.findMany({
    where: { occurredAt: { lt: new Date(now.getTime() - 365 * 86_400_000) } },
    select: { id: true },
    take: Math.min(batchSize, 1000),
  });
  if (oldEvents.length)
    await prisma.appointmentEvent.deleteMany({
      where: { id: { in: oldEvents.map((event) => event.id) } },
    });
  return { expired: expired.length, upcoming: upcoming.length, deletedEvents: oldEvents.length };
}
