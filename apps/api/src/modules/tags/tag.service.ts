import type { PrismaClient } from '@sales-ai/database';
import { tagInputSchema, tagPatchSchema } from '@sales-ai/validation';

type TagInput = ReturnType<typeof tagInputSchema.parse>;
type TagPatch = ReturnType<typeof tagPatchSchema.parse>;

function clean<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

export function createTag(prisma: PrismaClient, organizationId: string, input: TagInput) {
  return prisma.tag.create({ data: { organizationId, ...clean(input) } });
}

export function updateTag(prisma: PrismaClient, id: string, input: TagPatch) {
  return prisma.tag.update({ where: { id }, data: clean(input) });
}

export function deleteTag(prisma: PrismaClient, id: string) {
  return prisma.tag.delete({ where: { id } });
}

export function assignTag(
  prisma: PrismaClient,
  companyId: string,
  tagId: string,
  assignedBy: string,
) {
  return prisma.companyTag.upsert({
    where: { companyId_tagId: { companyId, tagId } },
    update: {},
    create: { companyId, tagId, assignedBy },
  });
}

export function removeTag(prisma: PrismaClient, companyId: string, tagId: string) {
  return prisma.companyTag.deleteMany({ where: { companyId, tagId } });
}
