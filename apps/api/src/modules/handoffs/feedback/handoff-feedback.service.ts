import type { PrismaClient } from '@sales-ai/database';

export function addHandoffFeedback(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    cardId: string;
    userId: string;
    verdict: string;
    fieldCode?: string;
    correctedCode?: string;
    reasonCode: string;
    note?: string | null;
  },
) {
  return prisma.salesHandoffFeedback.create({
    data: input,
  });
}
