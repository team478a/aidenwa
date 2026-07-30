import type { PrismaClient } from '@sales-ai/database';

export async function cleanupAppointmentEvents(prisma: PrismaClient, now: Date, batchSize: number) {
  const oldEvents = await prisma.appointmentEvent.findMany({
    where: { occurredAt: { lt: new Date(now.getTime() - 365 * 86_400_000) } },
    select: { id: true },
    take: Math.min(batchSize, 1000),
  });
  if (oldEvents.length)
    await prisma.appointmentEvent.deleteMany({
      where: { id: { in: oldEvents.map((event) => event.id) } },
    });
  return oldEvents.length;
}
