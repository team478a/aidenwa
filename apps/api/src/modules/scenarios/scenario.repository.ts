import type { PrismaClient } from '@sales-ai/database';

export function listScenarios(prisma: PrismaClient, organizationId: string) {
  return prisma.conversationScenario.findMany({
    where: { organizationId },
    include: { versions: { orderBy: { versionNumber: 'desc' } } },
    take: 100,
  });
}

export function findScenario(prisma: PrismaClient, organizationId: string, id: string) {
  return prisma.conversationScenario.findFirst({
    where: { id, organizationId },
    include: { versions: { include: { nodes: true, edges: true } } },
  });
}

export function findScenarioVersion(prisma: PrismaClient, organizationId: string, id: string) {
  return prisma.scenarioVersion.findFirst({
    where: { id, organizationId },
    include: { nodes: true, edges: true },
  });
}

export async function nextScenarioVersion(prisma: PrismaClient, scenarioId: string) {
  const latest = await prisma.scenarioVersion.findFirst({
    where: { scenarioId },
    orderBy: { versionNumber: 'desc' },
  });
  return (latest?.versionNumber ?? 0) + 1;
}
