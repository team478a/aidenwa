import type { PrismaClient } from '@sales-ai/database';

export async function cleanupExpiredHandoffs(
  prisma: PrismaClient,
  now = new Date(),
  batchSize = 500,
) {
  const cards = await prisma.salesHandoffCard.findMany({
    where: { expiresAt: { lt: now } },
    select: { id: true },
    take: Math.min(batchSize, 1000),
  });
  if (!cards.length) return { deletedCards: 0, deletedFeedback: 0 };
  const ids = cards.map((card) => card.id);
  const result = await prisma.$transaction(async (tx) => {
    const feedback = await tx.salesHandoffFeedback.deleteMany({ where: { cardId: { in: ids } } });
    const deleted = await tx.salesHandoffCard.deleteMany({ where: { id: { in: ids } } });
    return { deletedCards: deleted.count, deletedFeedback: feedback.count };
  });
  return result;
}
