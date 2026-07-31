import type { PrismaClient } from '@sales-ai/database';

export async function readProductionReadiness(
  prisma: PrismaClient,
  organizationId: string,
  now: Date,
) {
  const [approval, policy, providers, activeStops, allowlistCount] = await Promise.all([
    prisma.productionCallApproval.findFirst({
      where: { organizationId },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.productionCallPolicy.findUnique({ where: { organizationId } }),
    prisma.providerConfiguration.findMany({
      where: { organizationId },
      orderBy: { provider: 'asc' },
    }),
    prisma.emergencyStop.findMany({
      where: { active: true, OR: [{ scope: 'system' }, { organizationId }] },
    }),
    prisma.testCallAllowlist.count({
      where: {
        organizationId,
        active: true,
        consentConfirmed: true,
        expiresAt: { gt: now },
      },
    }),
  ]);
  return { approval, policy, providers, activeStops, allowlistCount };
}
