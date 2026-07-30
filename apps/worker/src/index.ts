import { Queue, Worker, type Job } from 'bullmq';
import Redis from 'ioredis';
import { PrismaClient } from '@sales-ai/database';
import { workerEnvSchema } from '@sales-ai/validation/env';
import { dispatchMockCall } from './jobs/mock-calls/dispatch.job.js';
import { processProviderWebhook } from './provider-webhook.js';
import { processImportJob } from './jobs/imports/index.js';
import { processTwilioCall, stopTwilioExecutions } from './twilio-call.js';
import {
  maintenanceJobNames,
  processMaintenanceJob,
  recordMaintenanceFailure,
  registerMaintenanceSchedulers,
} from './maintenance.js';

const env = workerEnvSchema.parse(process.env);
const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
const queue = new Queue('sales-ai-jobs', { connection });
const prisma = new PrismaClient({
  datasources: {
    db: { url: env.DATABASE_URL },
  },
});

async function processor(job: Job) {
  if (maintenanceJobNames.includes(job.name as (typeof maintenanceJobNames)[number])) {
    await processMaintenanceJob(job, prisma, connection, queue, env);
    return;
  }
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
    await dispatchMockCall(prisma, data.callJobId, data.organizationId);
    return;
  }
  await processImportJob(job, prisma);
}

const worker = new Worker('sales-ai-jobs', processor, {
  connection,
  concurrency: env.MOCK_WORKER_CONCURRENCY,
});
worker.on('failed', (job, cause) => {
  void recordMaintenanceFailure(prisma, job, cause);
});
worker.on('error', (cause) => {
  console.error(
    JSON.stringify({
      event: 'worker_error',
      failureCode: cause.name,
    }),
  );
});
queue.on('error', (cause) => {
  console.error(
    JSON.stringify({
      event: 'queue_error',
      failureCode: cause.name,
    }),
  );
});
await registerMaintenanceSchedulers(queue);

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  let failure: unknown;
  const close = async (action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (cause) {
      failure ??= cause;
    }
  };
  try {
    await close(() => worker.close());
    await close(() => connection.del(env.WORKER_HEALTH_KEY));
    await close(() => queue.close());
    await close(() => prisma.$disconnect());
  } finally {
    connection.disconnect();
  }
  if (failure) throw failure instanceof Error ? failure : new Error('worker_shutdown_failed');
}
function requestShutdown() {
  void shutdown().catch((cause) => {
    console.error(
      JSON.stringify({
        event: 'worker_shutdown_failed',
        failureCode: cause instanceof Error ? cause.name : 'UnknownError',
      }),
    );
    process.exitCode = 1;
  });
}
process.once('SIGINT', requestShutdown);
process.once('SIGTERM', requestShutdown);
