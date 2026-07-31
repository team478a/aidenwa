import type { PrismaClient } from '@sales-ai/database';
import type { ProductionPolicyInput } from '@sales-ai/validation';

export function findProductionPolicy(prisma: PrismaClient, organizationId: string) {
  return prisma.productionCallPolicy.findUnique({ where: { organizationId } });
}

export function saveProductionPolicy(
  prisma: PrismaClient,
  organizationId: string,
  userId: string,
  input: ProductionPolicyInput,
) {
  const data = { ...input, organizationId, updatedBy: userId };
  return prisma.productionCallPolicy.upsert({
    where: { organizationId },
    update: data,
    create: data,
  });
}
