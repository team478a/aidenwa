import type { PrismaClient } from '@sales-ai/database';
import type { WorkerEnv } from '@sales-ai/validation';
import { cleanupRealtimeData } from '../../realtime-cleanup.js';

const MINUTE = 60_000;
const DAY = 86_400_000;

export function runRealtimeCleanupJob(prisma: PrismaClient, env: WorkerEnv) {
  return cleanupRealtimeData(prisma, {
    staleBefore: new Date(Date.now() - env.REALTIME_STALE_SESSION_MINUTES * MINUTE),
    eventBefore: new Date(Date.now() - env.CALL_EVENT_RETENTION_DAYS * DAY),
  });
}
