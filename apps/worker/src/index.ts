import { Queue, Worker, type Job } from 'bullmq';
import Redis from 'ioredis';
import { PrismaClient } from '@sales-ai/database';
import { workerEnvSchema } from '@sales-ai/validation/env';
import { cleanupExpiredImports } from './import-cleanup.js';
import { processMockCall, recoverStuckReservations } from './mock-call.js';
import { processProviderWebhook } from './provider-webhook.js';
import { cleanupRealtimeData } from './realtime-cleanup.js';
import { reopenSnoozedFollowups } from './followup.js';
import { cleanupExpiredHandoffs } from './handoff-cleanup.js';
import { maintainAppointments } from './appointment.js';
import { publishOutboxBatch, repairOutboxGaps } from './outbox.js';
import { processCompanyImport } from './company-import.js';
import {
  expireTwilioAuthorizations,
  processTwilioCall,
  reconcileTwilioCosts,
  stopTwilioExecutions,
} from './twilio-call.js';

const env = workerEnvSchema.parse(process.env);
const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
const queue = new Queue('sales-ai-jobs', { connection });
const prisma = new PrismaClient({
  datasources: {
    db: {
      url:
        process.env.DATABASE_URL ??
        'postgresql://sales_ai:sales_ai_dev@localhost:5432/sales_ai?schema=public',
    },
  },
});

async function processor(job: Job) {
  if (job.name === 'twilio-emergency-stop') {
    const data = job.data as {
      organizationId?: string | null;
      scope?: 'system' | 'organization' | 'campaign' | 'product' | 'provider';
      scopeId?: string | null;
      authorizationId?: string;
    };
    await stopTwilioExecutions(prisma, env, data);
    return;
  }
  if (job.name === 'twilio-call') {
    const data = job.data as { executionId: string };
    await processTwilioCall(prisma, env, data.executionId);
    return;
  }
  if (job.name === 'provider-webhook') {
    const data = job.data as { eventId: string };
    await processProviderWebhook(prisma, data.eventId);
    return;
  }
  if (job.name === 'mock-call') {
    const data = job.data as { callJobId: string; organizationId: string };
    await processMockCall(prisma, data.callJobId, data.organizationId);
    return;
  }
  if (job.name !== 'company-import') return;
  const data = job.data as { importJobId: string; organizationId: string };
  await processCompanyImport(prisma, data);
}

const worker = new Worker('sales-ai-jobs', processor, {
  connection,
  concurrency: env.MOCK_WORKER_CONCURRENCY,
});
let outboxPublishing = false;
async function runOutboxPublisher() {
  if (outboxPublishing) return;
  outboxPublishing = true;
  try {
    await publishOutboxBatch(prisma, queue);
  } catch (cause) {
    console.error('outbox_publish_failed', cause instanceof Error ? cause.name : 'UnknownError');
  } finally {
    outboxPublishing = false;
  }
}
async function writeHealth() {
  await connection.set(
    env.WORKER_HEALTH_KEY,
    JSON.stringify({ service: 'worker', status: 'ok', timestamp: new Date().toISOString() }),
    'EX',
    15,
  );
}
await writeHealth();
await repairOutboxGaps(prisma);
await runOutboxPublisher();
const healthTimer = setInterval(() => void writeHealth(), 5_000);
const outboxTimer = setInterval(() => void runOutboxPublisher(), 5_000);
const cleanupTimer = setInterval(
  () =>
    void Promise.all([
      cleanupExpiredImports(prisma),
      recoverStuckReservations(
        prisma,
        new Date(Date.now() - env.STUCK_RESERVATION_MINUTES * 60_000),
      ),
      prisma.callEvent.deleteMany({
        where: {
          eventAt: { lt: new Date(Date.now() - env.CALL_EVENT_RETENTION_DAYS * 86_400_000) },
        },
      }),
      cleanupRealtimeData(prisma, {
        staleBefore: new Date(Date.now() - env.REALTIME_STALE_SESSION_MINUTES * 60_000),
        eventBefore: new Date(Date.now() - env.CALL_EVENT_RETENTION_DAYS * 86_400_000),
      }),
      reopenSnoozedFollowups(prisma),
      cleanupExpiredHandoffs(prisma),
      maintainAppointments(prisma),
      expireTwilioAuthorizations(prisma),
      repairOutboxGaps(prisma),
      ...(env.VOICE_PROVIDER === 'twilio' && env.PRODUCTION_CALLS_ENABLED
        ? [reconcileTwilioCosts(prisma, env)]
        : []),
    ]),
  60 * 60 * 1000,
);
async function shutdown() {
  clearInterval(healthTimer);
  clearInterval(outboxTimer);
  clearInterval(cleanupTimer);
  await connection.del(env.WORKER_HEALTH_KEY);
  await worker.close();
  await queue.close();
  await prisma.$disconnect();
  connection.disconnect();
}
process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
