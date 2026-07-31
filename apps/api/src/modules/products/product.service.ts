import type { PrismaClient } from '@sales-ai/database';
import { productVersionSchema, resourceInputSchema } from '@sales-ai/validation';

import { nextProductVersion } from './product.repository.js';

type ResourceInput = ReturnType<typeof resourceInputSchema.parse>;
type ProductVersionInput = ReturnType<typeof productVersionSchema.parse>;

export function createProduct(
  prisma: PrismaClient,
  organizationId: string,
  userId: string,
  input: ResourceInput,
) {
  return prisma.product.create({
    data: {
      organizationId,
      name: input.name,
      code: input.code ?? input.name.toLowerCase().replace(/\s+/gu, '-'),
      category: input.category,
      createdBy: userId,
    },
  });
}

export function updateProduct(
  prisma: PrismaClient,
  organizationId: string,
  id: string,
  name?: string,
) {
  return prisma.product.updateMany({ where: { id, organizationId }, data: { name } });
}

export function archiveProduct(prisma: PrismaClient, organizationId: string, id: string) {
  return prisma.product.updateMany({
    where: { id, organizationId },
    data: { status: 'archived', archivedAt: new Date() },
  });
}

export async function createProductVersion(
  prisma: PrismaClient,
  organizationId: string,
  userId: string,
  productId: string,
  input: ProductVersionInput,
) {
  return prisma.productVersion.create({
    data: {
      organizationId,
      productId,
      versionNumber: await nextProductVersion(prisma, productId),
      createdBy: userId,
      ...input,
    },
  });
}

export function publishProductVersion(
  prisma: PrismaClient,
  organizationId: string,
  userId: string,
  id: string,
) {
  return prisma.productVersion.updateMany({
    where: { id, organizationId, status: 'draft' },
    data: { status: 'published', publishedBy: userId, publishedAt: new Date() },
  });
}
