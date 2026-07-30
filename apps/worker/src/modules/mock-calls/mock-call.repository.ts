import type { PrismaClient } from '@sales-ai/database';
import { mockCallStopTransition, type MockCallStopReason } from '../../mock-call-state.js';

export async function applyMockCallStop(
  prisma: PrismaClient,
  callJobId: string,
  targetId: string,
  reason: MockCallStopReason,
) {
  const transition = mockCallStopTransition(reason);
  await prisma.$transaction([
    prisma.callJob.update({
      where: { id: callJobId },
      data: { status: transition.callJobStatus, errorCode: reason },
    }),
    prisma.campaignTarget.update({
      where: { id: targetId },
      data: {
        status: transition.targetStatus,
        ...(transition.excluded
          ? { eligibilityStatus: 'excluded', exclusionReason: reason }
          : { reservedAt: null }),
      },
    }),
  ]);
}

export async function recoverStuckReservations(prisma: PrismaClient, before: Date) {
  const result = await prisma.campaignTarget.updateMany({
    where: { status: 'reserved', reservedAt: { lt: before } },
    data: { status: 'pending', reservedAt: null },
  });
  return result.count;
}
