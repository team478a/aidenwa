import { Worker, type Job, type Queue } from 'bullmq';
import type Redis from 'ioredis';
import type { PrismaClient } from '@sales-ai/database';
import type { WorkerEnv } from '@sales-ai/validation';
import { processImportJob } from '../jobs/imports/index.js';
import { dispatchMockCall } from '../jobs/mock-calls/dispatch.job.js';
import { dispatchProductionCall } from '../jobs/production-calls/dispatch.job.js';
import { stopTwilioExecutions } from '../jobs/production-calls/rollback.job.js';
import {
  maintenanceJobNames,
  processMaintenanceJob,
  recordMaintenanceFailure,
} from '../maintenance.js';
import { processProviderWebhook } from '../provider-webhook.js';
import { processExternalCallRequest } from '../jobs/integrations/call-request.job.js';
import { deliverExternalWebhook } from '../jobs/integrations/webhook-delivery.job.js';

export type JobHandler = (job: Job) => Promise<void>;

type HandlerDependencies = {
  prisma: PrismaClient;
  redis: Redis;
  queue: Queue;
  env: WorkerEnv;
};

export function createJobHandlers(deps: HandlerDependencies): Readonly<Record<string, JobHandler>> {
  const handlers: Record<string, JobHandler> = {
    'company-import-mapping': async (job) => {
      await processImportJob(job, deps.prisma);
    },
    'company-import': async (job) => {
      await processImportJob(job, deps.prisma);
    },
    'mock-call': async (job) => {
      const data = job.data as { callJobId: string; organizationId: string };
      await dispatchMockCall(deps.prisma, data.callJobId, data.organizationId);
    },
    'twilio-call': async (job) => {
      const data = job.data as { executionId: string };
      await dispatchProductionCall(deps.prisma, deps.env, data.executionId);
    },
    'twilio-emergency-stop': async (job) => {
      const data = job.data as {
        organizationId?: string | null;
        scope?: 'system' | 'organization' | 'campaign' | 'product' | 'provider';
        scopeId?: string | null;
        authorizationId?: string;
      };
      await stopTwilioExecutions(deps.prisma, deps.env, data);
    },
    'provider-webhook': async (job) => {
      const data = job.data as { eventId: string };
      await processProviderWebhook(deps.prisma, data.eventId);
    },
    'external-call': async (job) => {
      const data = job.data as { executionId: string; organizationId: string };
      await processExternalCallRequest(
        deps.prisma,
        deps.env,
        data.executionId,
        data.organizationId,
      );
    },
    'webhook-delivery': async (job) => {
      const data = job.data as { deliveryId: string };
      await deliverExternalWebhook(
        deps.prisma,
        deps.env.SOURCE_NUMBER_FINGERPRINT_KEY,
        data.deliveryId,
      );
    },
  };
  for (const name of maintenanceJobNames)
    handlers[name] = (job) =>
      processMaintenanceJob(job, deps.prisma, deps.redis, deps.queue, deps.env);
  return handlers;
}

export function createJobProcessor(
  handlers: Readonly<Record<string, JobHandler>>,
  warn: (message: string) => void = console.warn,
) {
  return async (job: Job) => {
    const handler = handlers[job.name];
    if (handler) {
      await handler(job);
      return;
    }
    warn(
      JSON.stringify({
        event: 'unknown_job',
        jobName: sanitizeJobName(job.name),
      }),
    );
  };
}

export function registerWorker(deps: HandlerDependencies) {
  const handlers = createJobHandlers(deps);
  const worker = new Worker('sales-ai-jobs', createJobProcessor(handlers), {
    connection: deps.redis,
    concurrency: deps.env.MOCK_WORKER_CONCURRENCY,
  });
  worker.on('failed', (job, cause) => {
    void recordMaintenanceFailure(deps.prisma, job, cause);
  });
  worker.on('error', (cause) => {
    console.error(
      JSON.stringify({
        event: 'worker_error',
        failureCode: cause.name,
      }),
    );
  });
  return worker;
}

function sanitizeJobName(name: string) {
  return name.replace(/[^a-zA-Z0-9:_-]/gu, '_').slice(0, 100);
}
