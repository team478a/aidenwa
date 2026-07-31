import type { PrismaClient } from '@sales-ai/database';

const productInclude = { versions: { orderBy: { versionNumber: 'desc' as const } } };

export function listProducts(prisma: PrismaClient, organizationId: string) {
  return prisma.product.findMany({
    where: { organizationId },
    include: productInclude,
    orderBy: { updatedAt: 'desc' },
    take: 100,
  });
}

export function findProduct(prisma: PrismaClient, organizationId: string, id: string) {
  return prisma.product.findFirst({
    where: { id, organizationId },
    include: productInclude,
  });
}

export async function nextProductVersion(prisma: PrismaClient, productId: string) {
  const latest = await prisma.productVersion.findFirst({
    where: { productId },
    orderBy: { versionNumber: 'desc' },
  });
  return (latest?.versionNumber ?? 0) + 1;
}
