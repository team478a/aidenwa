import type { PrismaClient } from '@sales-ai/database';
import { rebuildUsageCounters } from '../mock-calls/usage-rebuild.job.js';

export async function runUsageRebuildJob(prisma: PrismaClient) {
  const organizations = await prisma.usageLedger.findMany({
    distinct: ['organizationId'],
    select: { organizationId: true },
  });
  for (const organization of organizations)
    await rebuildUsageCounters(prisma, organization.organizationId);
}
