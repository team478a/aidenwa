import type { PrismaClient } from '@sales-ai/database';

export function listContacts(prisma: PrismaClient, organizationId: string, companyId: string) {
  return prisma.companyContact.findMany({
    where: { organizationId, companyId, isDeleted: false },
  });
}

export function findContact(prisma: PrismaClient, organizationId: string, id: string) {
  return prisma.companyContact.findFirst({
    where: { id, organizationId, isDeleted: false },
    include: { company: true },
  });
}
