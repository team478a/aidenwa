import type { PrismaClient } from '@sales-ai/database';
import type { WorkerEnv } from '@sales-ai/validation';
import { reconcileTwilioCosts } from '../production-calls/cost-reconciliation.job.js';

export function runCostReconciliationJob(prisma: PrismaClient, env: WorkerEnv) {
  if (env.VOICE_PROVIDER !== 'twilio' || !env.PRODUCTION_CALLS_ENABLED) return Promise.resolve();
  return reconcileTwilioCosts(prisma, env);
}
