import type { PrismaClient } from '@sales-ai/database';
import { terminableRealtimeStatuses } from './realtime-session.policy.js';

export function listRealtimeSessions(prisma: PrismaClient, organizationId: string) {
  return prisma.realtimeCallSession.findMany({
    where: { organizationId },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
}

export function findRealtimeSession(prisma: PrismaClient, organizationId: string, id: string) {
  return prisma.realtimeCallSession.findFirst({ where: { id, organizationId } });
}

export function listRealtimeEvents(
  prisma: PrismaClient,
  organizationId: string,
  sessionId: string,
) {
  return prisma.realtimeCallEvent.findMany({
    where: { sessionId, organizationId },
    orderBy: { monotonicSequence: 'asc' },
  });
}

export function terminateRealtimeSession(prisma: PrismaClient, organizationId: string, id: string) {
  return prisma.realtimeCallSession.updateMany({
    where: {
      id,
      organizationId,
      status: { in: [...terminableRealtimeStatuses] },
    },
    data: { status: 'completed', resultCode: 'terminated_by_operator', endedAt: new Date() },
  });
}
