import type { PrismaClient } from '@sales-ai/database';

export async function cleanupRealtimeData(
  prisma: PrismaClient,
  input: { staleBefore: Date; eventBefore: Date; batchSize?: number },
) {
  const batchSize = Math.min(input.batchSize ?? 500, 1000);
  const stale = await prisma.realtimeCallSession.findMany({
    where: {
      status: {
        in: ['authenticating', 'connecting_twilio', 'connecting_openai', 'active', 'ending'],
      },
      updatedAt: { lt: input.staleBefore },
    },
    select: { id: true, organizationId: true },
    take: batchSize,
  });
  if (stale.length)
    await prisma.$transaction([
      prisma.realtimeCallSession.updateMany({
        where: {
          id: { in: stale.map((row) => row.id) },
          status: { notIn: ['completed', 'failed', 'provider_unknown'] },
        },
        data: { status: 'provider_unknown', failureCode: 'stale_session', endedAt: new Date() },
      }),
      ...stale.map((row) =>
        prisma.auditLog.create({
          data: {
            organizationId: row.organizationId,
            action: 'realtime.cleanup.stale',
            entityType: 'realtime_call_session',
            entityId: row.id,
            afterData: { reasonCode: 'stale_session', redialScheduled: false },
          },
        }),
      ),
    ]);
  const expired = await prisma.realtimeCallEvent.findMany({
    where: { receivedAt: { lt: input.eventBefore } },
    select: { id: true },
    take: batchSize,
  });
  if (expired.length)
    await prisma.realtimeCallEvent.deleteMany({
      where: { id: { in: expired.map((row) => row.id) } },
    });
  return { staleSessions: stale.length, deletedEvents: expired.length };
}
