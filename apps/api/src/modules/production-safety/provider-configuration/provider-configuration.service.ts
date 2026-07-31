import type { PrismaClient } from '@sales-ai/database';

export function saveProviderConfiguration(
  prisma: PrismaClient,
  organizationId: string,
  userId: string,
  input: {
    provider: string;
    allowed: boolean;
    secretReferenceKey?: string | null;
  },
) {
  const data = {
    allowed: input.allowed,
    productionEnabled: false,
    secretReferenceKey: input.secretReferenceKey,
    updatedBy: userId,
  };
  return prisma.providerConfiguration.upsert({
    where: { organizationId_provider: { organizationId, provider: input.provider } },
    update: data,
    create: { ...data, organizationId, provider: input.provider },
  });
}
