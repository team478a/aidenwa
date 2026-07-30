import type { PrismaClient } from '@sales-ai/database';

export async function expireAppointmentHolds(prisma: PrismaClient, now: Date, batchSize: number) {
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
  return expired.length;
}
