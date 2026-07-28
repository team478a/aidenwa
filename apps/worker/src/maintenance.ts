import type { Job, JobsOptions, Queue } from 'bullmq';
import type Redis from 'ioredis';
import type { PrismaClient } from '@sales-ai/database';
import type { WorkerEnv } from '@sales-ai/validation';
import { maintainAppointments } from './appointment.js';
import { reopenSnoozedFollowups } from './followup.js';
import { cleanupExpiredHandoffs } from './handoff-cleanup.js';
import { cleanupExpiredImports } from './import-cleanup.js';
import { rebuildUsageCounters, recoverStuckReservations } from './mock-call.js';
import { publishOutboxBatch, repairOutboxGaps } from './outbox.js';
import { cleanupRealtimeData } from './realtime-cleanup.js';
import { expireTwilioAuthorizations, reconcileTwilioCosts } from './twilio-call.js';

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

async function runUsageCounterRebuild(prisma: PrismaClient) {
  const organizations = await prisma.usageLedger.findMany({
    distinct: ['organizationId'],
    select: { organizationId: true },
  });
  for (const organization of organizations)
    await rebuildUsageCounters(prisma, organization.organizationId);
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
      await redis.set(
        env.WORKER_HEALTH_KEY,
        JSON.stringify({ service: 'worker', status: 'ok', timestamp: new Date().toISOString() }),
        'EX',
        15,
      );
      return;
    case 'maintenance:import-cleanup':
      await cleanupExpiredImports(prisma);
      return;
    case 'maintenance:stuck-reservation-recovery':
      await recoverStuckReservations(
        prisma,
        new Date(Date.now() - env.STUCK_RESERVATION_MINUTES * MINUTE),
      );
      return;
    case 'maintenance:call-event-cleanup':
      await prisma.callEvent.deleteMany({
        where: {
          eventAt: { lt: new Date(Date.now() - env.CALL_EVENT_RETENTION_DAYS * 24 * HOUR) },
        },
      });
      return;
    case 'maintenance:realtime-cleanup':
      await cleanupRealtimeData(prisma, {
        staleBefore: new Date(Date.now() - env.REALTIME_STALE_SESSION_MINUTES * MINUTE),
        eventBefore: new Date(Date.now() - env.CALL_EVENT_RETENTION_DAYS * 24 * HOUR),
      });
      return;
    case 'maintenance:snoozed-followup-reopen':
      await reopenSnoozedFollowups(prisma);
      return;
    case 'maintenance:handoff-cleanup':
      await cleanupExpiredHandoffs(prisma);
      return;
    case 'maintenance:appointment':
      await maintainAppointments(prisma);
      return;
    case 'maintenance:twilio-authorization-expiry':
      await expireTwilioAuthorizations(prisma);
      return;
    case 'maintenance:twilio-cost-reconciliation':
      if (env.VOICE_PROVIDER === 'twilio' && env.PRODUCTION_CALLS_ENABLED)
        await reconcileTwilioCosts(prisma, env);
      return;
    case 'maintenance:outbox-publish':
      await repairOutboxGaps(prisma);
      await publishOutboxBatch(prisma, queue);
      return;
    case 'maintenance:usage-counter-rebuild':
      await runUsageCounterRebuild(prisma);
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

export async function recordMaintenanceFailure(
  prisma: PrismaClient,
  job: Job | undefined,
  cause: Error,
) {
  if (!job || !maintenanceJobNames.includes(job.name as MaintenanceJobName)) return;
  const attempts = typeof job.opts.attempts === 'number' ? job.opts.attempts : 1;
  const exhausted = job.attemptsMade >= attempts;
  console.error(
    JSON.stringify({
      event: exhausted ? 'maintenance_job_exhausted' : 'maintenance_job_retrying',
      jobName: job.name,
      jobId: job.id ?? null,
      attemptsMade: job.attemptsMade,
      failureCode: cause.name,
    }),
  );
  if (!exhausted) return;
  try {
    const organization = await prisma.organization.findFirst({ select: { id: true } });
    if (!organization) return;
    const dedupeKey = `job:${job.name}:${job.id ?? 'unknown'}`;
    await prisma.productionIncident.upsert({
      where: { dedupeKey },
      update: {},
      create: {
        organizationId: organization.id,
        category: 'maintenance_job_retry_exhausted',
        entityType: 'maintenance_job',
        entityId: job.id ?? null,
        dedupeKey,
        summary: `Worker保守処理が再試行上限に達しました: ${job.name}`,
        sanitizedDetails: {
          jobName: job.name,
          attemptsMade: job.attemptsMade,
          failureCode: cause.name,
        },
        dueAt: new Date(Date.now() + HOUR),
      },
    });
  } catch (incidentCause) {
    console.error(
      JSON.stringify({
        event: 'maintenance_incident_write_failed',
        jobName: job.name,
        failureCode: incidentCause instanceof Error ? incidentCause.name : 'UnknownError',
      }),
    );
  }
}
