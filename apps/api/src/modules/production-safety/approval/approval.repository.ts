import type { PrismaClient } from '@sales-ai/database';

export function listApprovals(prisma: PrismaClient, organizationId: string) {
  return prisma.productionCallApproval.findMany({
    where: { organizationId },
    orderBy: { updatedAt: 'desc' },
  });
}

export function countScopedProducts(
  prisma: PrismaClient,
  organizationId: string,
  productIds: string[],
) {
  return prisma.product.count({ where: { organizationId, id: { in: productIds } } });
}

export function findEditableApproval(prisma: PrismaClient, organizationId: string, id: string) {
  return prisma.productionCallApproval.findFirst({
    where: { id, organizationId, status: { in: ['draft', 'rejected'] } },
  });
}

export function findSubmittableApproval(prisma: PrismaClient, organizationId: string, id: string) {
  return prisma.productionCallApproval.findFirst({
    where: { id, organizationId, status: 'draft' },
  });
}

export function findApproval(prisma: PrismaClient, id: string) {
  return prisma.productionCallApproval.findUnique({ where: { id } });
}
