import type { PrismaClient } from '@sales-ai/database';
import { documentSchema, entrySchema, resourceInputSchema } from '@sales-ai/validation';

type ResourceInput = ReturnType<typeof resourceInputSchema.parse>;
type DocumentInput = ReturnType<typeof documentSchema.parse>;
type EntryInput = ReturnType<typeof entrySchema.parse>;

export function createKnowledgeBase(
  prisma: PrismaClient,
  organizationId: string,
  userId: string,
  input: ResourceInput,
) {
  return prisma.knowledgeBase.create({
    data: {
      organizationId,
      name: input.name,
      description: input.description ?? '',
      createdBy: userId,
    },
  });
}

export function updateKnowledgeBase(
  prisma: PrismaClient,
  organizationId: string,
  id: string,
  name?: string,
) {
  return prisma.knowledgeBase.updateMany({ where: { id, organizationId }, data: { name } });
}

export function createKnowledgeDocument(
  prisma: PrismaClient,
  organizationId: string,
  userId: string,
  knowledgeBaseId: string,
  input: DocumentInput,
) {
  return prisma.knowledgeDocument.create({
    data: {
      organizationId,
      knowledgeBaseId,
      title: input.title,
      sourceType: input.sourceType,
      createdBy: userId,
    },
  });
}

export function createKnowledgeEntry(
  prisma: PrismaClient,
  organizationId: string,
  knowledgeDocumentId: string,
  input: EntryInput,
) {
  return prisma.knowledgeEntry.create({
    data: { organizationId, knowledgeDocumentId, ...input },
  });
}

export function updateKnowledgeDocument(
  prisma: PrismaClient,
  organizationId: string,
  id: string,
  input: Partial<DocumentInput>,
) {
  return prisma.knowledgeDocument.updateMany({
    where: { id, organizationId, status: 'draft' },
    data: input,
  });
}

export function updateKnowledgeEntry(prisma: PrismaClient, id: string, input: Partial<EntryInput>) {
  return prisma.knowledgeEntry.update({ where: { id }, data: input });
}

export function publishKnowledgeDocument(
  prisma: PrismaClient,
  organizationId: string,
  userId: string,
  id: string,
) {
  return prisma.knowledgeDocument.updateMany({
    where: { id, organizationId, status: 'draft' },
    data: { status: 'published', publishedBy: userId, publishedAt: new Date() },
  });
}
