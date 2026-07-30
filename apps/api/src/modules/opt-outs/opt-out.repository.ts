import type { PrismaClient } from '@sales-ai/database';

export function listOptOuts(
  prisma: PrismaClient,
  where: ReturnType<typeof import('./opt-out.policy.js').optOutListScope>,
) {
  return prisma.optOut.findMany({
    where,
    include: {
      company: { select: { id: true, name: true } },
      phoneNumber: true,
      contact: true,
      registrar: { select: { id: true, name: true } },
      releaser: { select: { id: true, name: true } },
    },
    orderBy: { registeredAt: 'desc' },
    take: 500,
  });
}

export function findOptOutPhone(prisma: PrismaClient, organizationId: string, id?: string) {
  if (!id) return null;
  return prisma.phoneNumber.findFirst({ where: { id, organizationId } });
}

export function findOptOutContact(prisma: PrismaClient, organizationId: string, id?: string) {
  if (!id) return null;
  return prisma.companyContact.findFirst({ where: { id, organizationId } });
}

export function findActiveOptOut(prisma: PrismaClient, organizationId: string, id: string) {
  return prisma.optOut.findFirst({ where: { id, organizationId, status: 'active' } });
}
