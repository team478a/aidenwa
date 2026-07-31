import type { PrismaClient } from '@sales-ai/database';

export function listKnowledgeBases(prisma: PrismaClient, organizationId: string) {
  return prisma.knowledgeBase.findMany({
    where: { organizationId },
    include: { documents: { include: { entries: true } } },
    take: 100,
  });
}

export function findKnowledgeBase(prisma: PrismaClient, organizationId: string, id: string) {
  return prisma.knowledgeBase.findFirst({
    where: { id, organizationId },
    include: { documents: { include: { entries: true } } },
  });
}

export function findDraftDocument(prisma: PrismaClient, organizationId: string, id: string) {
  return prisma.knowledgeDocument.findFirst({
    where: { id, organizationId, status: 'draft' },
  });
}

export function findDraftEntry(prisma: PrismaClient, organizationId: string, id: string) {
  return prisma.knowledgeEntry.findFirst({
    where: { id, organizationId, document: { status: 'draft' } },
  });
}

export function searchKnowledge(
  prisma: PrismaClient,
  organizationId: string,
  knowledgeBaseId: string,
  query: string,
  now: Date,
) {
  return prisma.knowledgeEntry.findMany({
    where: {
      organizationId,
      document: { knowledgeBaseId, status: 'published' },
      status: 'active',
      AND: [
        { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
        { OR: [{ validUntil: null }, { validUntil: { gte: now } }] },
        {
          OR: [
            { question: { contains: query, mode: 'insensitive' } },
            { answer: { contains: query, mode: 'insensitive' } },
          ],
        },
      ],
    },
    orderBy: { priority: 'asc' },
    take: 20,
  });
}
