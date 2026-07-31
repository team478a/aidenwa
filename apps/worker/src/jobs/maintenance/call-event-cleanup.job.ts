import type { PrismaClient } from '@sales-ai/database';
import type { WorkerEnv } from '@sales-ai/validation';

const DAY = 86_400_000;

export function runCallEventCleanupJob(prisma: PrismaClient, env: WorkerEnv) {
  return prisma.callEvent.deleteMany({
    where: {
      eventAt: { lt: new Date(Date.now() - env.CALL_EVENT_RETENTION_DAYS * DAY) },
    },
  });
}
