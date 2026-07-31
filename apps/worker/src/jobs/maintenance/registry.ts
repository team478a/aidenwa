import type { Job, JobsOptions, Queue } from 'bullmq';
import type Redis from 'ioredis';
import type { PrismaClient } from '@sales-ai/database';
import type { WorkerEnv } from '@sales-ai/validation';
import { runAppointmentMaintenanceJob } from './appointment-maintenance.job.js';
import { runAuthorizationExpiryJob } from './authorization-expiry.job.js';
import { runCallEventCleanupJob } from './call-event-cleanup.job.js';
import { runCostReconciliationJob } from './cost-reconciliation.job.js';
import { runFollowupReopenJob } from './followup-reopen.job.js';
import { runHandoffCleanupJob } from './handoff-cleanup.job.js';
import { runHealthJob } from './health.job.js';
import { runImportCleanupJob } from './import-cleanup.job.js';
import { runOutboxPublishJob } from './outbox-publish.job.js';
import { runRealtimeCleanupJob } from './realtime-cleanup.job.js';
import { runReservationRecoveryJob } from './reservation-recovery.job.js';
import { runUsageRebuildJob } from './usage-rebuild.job.js';

export const maintenanceJobNames = [
  'maintenance:worker-health',
  'maintenance:import-cleanup',
  'maintenance:stuck-reservation-recovery',
  'maintenance:call-event-cleanup',
  'maintenance:realtime-cleanup',
  'maintenance:snoozed-followup-reopen',
  'maintenance:handoff-cleanup',
  'maintenance:appointment',
  'maintenance:twilio-authorization-expiry',
  'maintenance:twilio-cost-reconciliation',
  'maintenance:outbox-publish',
  'maintenance:usage-counter-rebuild',
] as const;

export type MaintenanceJobName = (typeof maintenanceJobNames)[number];

type MaintenanceDefinition = {
  name: MaintenanceJobName;
  every: number;
  timeoutMs: number;
  attempts: number;
};

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

export function maintenanceDefinitions(): readonly MaintenanceDefinition[] {
  return [
    { name: 'maintenance:worker-health', every: 5 * SECOND, timeoutMs: 4 * SECOND, attempts: 3 },
    { name: 'maintenance:outbox-publish', every: 5 * SECOND, timeoutMs: 4 * SECOND, attempts: 3 },
    { name: 'maintenance:import-cleanup', every: HOUR, timeoutMs: 10 * MINUTE, attempts: 3 },
    {
      name: 'maintenance:stuck-reservation-recovery',
      every: HOUR,
      timeoutMs: 10 * MINUTE,
      attempts: 3,
    },
    { name: 'maintenance:call-event-cleanup', every: HOUR, timeoutMs: 10 * MINUTE, attempts: 3 },
    { name: 'maintenance:realtime-cleanup', every: HOUR, timeoutMs: 10 * MINUTE, attempts: 3 },
    {
      name: 'maintenance:snoozed-followup-reopen',
      every: HOUR,
      timeoutMs: 10 * MINUTE,
      attempts: 3,
    },
    { name: 'maintenance:handoff-cleanup', every: HOUR, timeoutMs: 10 * MINUTE, attempts: 3 },
    { name: 'maintenance:appointment', every: HOUR, timeoutMs: 10 * MINUTE, attempts: 3 },
    {
      name: 'maintenance:twilio-authorization-expiry',
      every: HOUR,
      timeoutMs: 10 * MINUTE,
      attempts: 3,
    },
    {
      name: 'maintenance:twilio-cost-reconciliation',
      every: HOUR,
      timeoutMs: 20 * MINUTE,
      attempts: 3,
    },
    {
      name: 'maintenance:usage-counter-rebuild',
      every: 24 * HOUR,
      timeoutMs: 30 * MINUTE,
      attempts: 3,
    },
  ];
}

const historyOptions: JobsOptions = {
  removeOnComplete: 100,
  removeOnFail: 1_000,
};

export async function registerMaintenanceSchedulers(queue: Queue) {
  for (const definition of maintenanceDefinitions()) {
    await queue.upsertJobScheduler(
      definition.name,
      { every: definition.every },
      {
        name: definition.name,
        data: {},
        opts: {
          ...historyOptions,
          attempts: definition.attempts,
          backoff: { type: 'exponential', delay: SECOND },
        },
      },
    );
  }
}

function definitionFor(name: string) {
  return maintenanceDefinitions().find((definition) => definition.name === name);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, jobName: string) {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`maintenance_timeout:${jobName}`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function executeMaintenance(
  name: MaintenanceJobName,
  prisma: PrismaClient,
  redis: Redis,
  queue: Queue,
  env: WorkerEnv,
) {
  switch (name) {
    case 'maintenance:worker-health':
      await runHealthJob(redis, env);
      return;
    case 'maintenance:import-cleanup':
      await runImportCleanupJob(prisma);
      return;
    case 'maintenance:stuck-reservation-recovery':
      await runReservationRecoveryJob(prisma, env);
      return;
    case 'maintenance:call-event-cleanup':
      await runCallEventCleanupJob(prisma, env);
      return;
    case 'maintenance:realtime-cleanup':
      await runRealtimeCleanupJob(prisma, env);
      return;
    case 'maintenance:snoozed-followup-reopen':
      await runFollowupReopenJob(prisma);
      return;
    case 'maintenance:handoff-cleanup':
      await runHandoffCleanupJob(prisma);
      return;
    case 'maintenance:appointment':
      await runAppointmentMaintenanceJob(prisma);
      return;
    case 'maintenance:twilio-authorization-expiry':
      await runAuthorizationExpiryJob(prisma);
      return;
    case 'maintenance:twilio-cost-reconciliation':
      await runCostReconciliationJob(prisma, env);
      return;
    case 'maintenance:outbox-publish':
      await runOutboxPublishJob(prisma, queue);
      return;
    case 'maintenance:usage-counter-rebuild':
      await runUsageRebuildJob(prisma);
  }
}

export async function processMaintenanceJob(
  job: Job,
  prisma: PrismaClient,
  redis: Redis,
  queue: Queue,
  env: WorkerEnv,
) {
  const definition = definitionFor(job.name);
  if (!definition) throw new Error('unknown_maintenance_job');
  const token = crypto.randomUUID();
  const lockKey = `sales-ai-os:maintenance-lock:${definition.name}`;
  const acquired = await redis.set(lockKey, token, 'PX', definition.timeoutMs * 2, 'NX');
  if (acquired !== 'OK') return;
  const releaseLock = async () => {
    await redis.eval(
      'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end',
      1,
      lockKey,
      token,
    );
  };
  const operation = executeMaintenance(definition.name, prisma, redis, queue, env);
  let timedOut = false;
  try {
    await withTimeout(operation, definition.timeoutMs, definition.name);
  } catch (cause) {
    timedOut = cause instanceof Error && cause.message === `maintenance_timeout:${definition.name}`;
    if (timedOut) void operation.finally(releaseLock).catch(() => undefined);
    throw cause;
  } finally {
    if (!timedOut) await releaseLock();
  }
}
