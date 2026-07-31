import type { PrismaClient } from '@sales-ai/database';

export async function handoffQualitySummary(prisma: PrismaClient, organizationId: string) {
  const [total, lowConfidence, feedback, incorrect] = await Promise.all([
    prisma.salesHandoffCard.count({ where: { organizationId } }),
    prisma.salesHandoffCard.count({
      where: { organizationId, confidenceBand: 'low' },
    }),
    prisma.salesHandoffFeedback.count({ where: { organizationId } }),
    prisma.salesHandoffFeedback.count({
      where: { organizationId, verdict: 'incorrect' },
    }),
  ]);
  return {
    total,
    lowConfidence,
    humanReviewRate: total ? lowConfidence / total : 0,
    feedbackCount: feedback,
    incorrectRate: feedback ? incorrect / feedback : 0,
  };
}
