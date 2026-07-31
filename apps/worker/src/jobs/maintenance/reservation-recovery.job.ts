import type { PrismaClient } from '@sales-ai/database';
import type { WorkerEnv } from '@sales-ai/validation';
import { recoverStuckReservations } from '../mock-calls/recovery.job.js';

const MINUTE = 60_000;

export function runReservationRecoveryJob(prisma: PrismaClient, env: WorkerEnv) {
  return recoverStuckReservations(
    prisma,
    new Date(Date.now() - env.STUCK_RESERVATION_MINUTES * MINUTE),
  );
}
