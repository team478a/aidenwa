import { Prisma, type PrismaClient } from '@sales-ai/database';

export async function openProductionIncident(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    category: string;
    entityType: string;
    entityId?: string | null;
    summary: string;
    details: Prisma.InputJsonObject;
  },
) {
  const existing = await prisma.productionIncident.findFirst({
    where: {
      organizationId: input.organizationId,
      category: input.category,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      status: { in: ['open', 'investigating'] },
    },
  });
  if (existing) return existing;
  return prisma.productionIncident.create({
    data: {
      organizationId: input.organizationId,
      category: input.category,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      summary: input.summary,
      sanitizedDetails: input.details,
      dueAt: new Date(Date.now() + 3_600_000),
    },
  });
}
