import type { PrismaClient } from '@sales-ai/database';

export function listAiAgents(prisma: PrismaClient, organizationId: string) {
  return prisma.aiAgent.findMany({
    where: { organizationId },
    include: { versions: { orderBy: { versionNumber: 'desc' } } },
    take: 100,
  });
}

export function findAiAgent(prisma: PrismaClient, organizationId: string, id: string) {
  return prisma.aiAgent.findFirst({
    where: { id, organizationId },
    include: { versions: true },
  });
}

export async function nextAiAgentVersion(prisma: PrismaClient, aiAgentId: string) {
  const latest = await prisma.aiAgentVersion.findFirst({
    where: { aiAgentId },
    orderBy: { versionNumber: 'desc' },
  });
  return (latest?.versionNumber ?? 0) + 1;
}
