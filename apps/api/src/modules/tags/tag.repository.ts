import type { PrismaClient } from '@sales-ai/database';

export function listTags(prisma: PrismaClient, organizationId: string) {
  return prisma.tag.findMany({
    where: { organizationId },
    include: { _count: { select: { companyTags: true } } },
    orderBy: { name: 'asc' },
  });
}

export function findTag(prisma: PrismaClient, organizationId: string, id: string) {
  return prisma.tag.findFirst({ where: { id, organizationId } });
}

export function listCompanyTags(prisma: PrismaClient, companyId: string) {
  return prisma.companyTag.findMany({ where: { companyId }, include: { tag: true } });
}

export function countTagAssignments(prisma: PrismaClient, tagId: string) {
  return prisma.companyTag.count({ where: { tagId } });
}
