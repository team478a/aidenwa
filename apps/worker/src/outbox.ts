import type { JobsOptions } from 'bullmq';
import { enqueueOutbox, type PrismaClient } from '@sales-ai/database';
import {
  outboxEventTypeSchema,
  parseOutboxPayload,
  type OutboxEventType,
} from '@sales-ai/validation';

type QueueLike = {
  add(name: string, data: object, options: JobsOptions): Promise<unknown>;
};

const MAX_ATTEMPTS = 8;
const LOCK_TIMEOUT_MS = 5 * 60_000;

function queueOptions(eventType: OutboxEventType, aggregateId: string): JobsOptions {
  const common = { removeOnComplete: 100, removeOnFail: 100 };
  switch (eventType) {
    case 'company-import':
      return { ...common, jobId: `company-import-${aggregateId}`, attempts: 3 };
    case 'mock-call':
      return {
        ...common,
        jobId: `mock-call-${aggregateId}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      };
    case 'twilio-call':
      return { ...common, jobId: `twilio-call-${aggregateId}`, attempts: 1 };
    case 'twilio-emergency-stop':
      return {
        ...common,
        jobId: `twilio-emergency-stop-${aggregateId}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      };
  }
}

export async function publishOutboxBatch(
  prisma: PrismaClient,
  queue: QueueLike,
  now = new Date(),
  batchSize = 50,
) {
  const staleBefore = new Date(now.getTime() - LOCK_TIMEOUT_MS);
  const candidates = await prisma.outboxEvent.findMany({
    where: {
      OR: [
        { status: 'pending', availableAt: { lte: now } },
        { status: 'publishing', lockedAt: { lte: staleBefore } },
      ],
    },
    orderBy: { createdAt: 'asc' },
    take: Math.min(Math.max(batchSize, 1), 100),
  });
  let published = 0;
  let retried = 0;
  let failed = 0;
  for (const candidate of candidates) {
    const claimed = await prisma.outboxEvent.updateMany({
      where: {
        id: candidate.id,
        OR: [
          { status: 'pending', availableAt: { lte: now } },
          { status: 'publishing', lockedAt: { lte: staleBefore } },
        ],
      },
      data: { status: 'publishing', lockedAt: now },
    });
    if (!claimed.count) continue;
    try {
      const eventType = outboxEventTypeSchema.parse(candidate.eventType);
      const payload = parseOutboxPayload(eventType, candidate.payload);
      await queue.add(eventType, payload, queueOptions(eventType, candidate.aggregateId));
      await prisma.outboxEvent.updateMany({
        where: { id: candidate.id, status: 'publishing' },
        data: {
          status: 'published',
          publishedAt: now,
          lockedAt: null,
          lastErrorCode: null,
        },
      });
      published += 1;
    } catch (cause) {
      const attemptCount = candidate.attemptCount + 1;
      const terminal = attemptCount >= MAX_ATTEMPTS;
      const delayMs = Math.min(2 ** Math.max(attemptCount - 1, 0) * 1000, 60 * 60_000);
      await prisma.outboxEvent.updateMany({
        where: { id: candidate.id, status: 'publishing' },
        data: {
          status: terminal ? 'failed' : 'pending',
          attemptCount,
          availableAt: new Date(now.getTime() + delayMs),
          lockedAt: null,
          lastErrorCode: cause instanceof Error ? cause.name.slice(0, 100) : 'UnknownError',
        },
      });
      if (terminal) failed += 1;
      else retried += 1;
    }
  }
  return { examined: candidates.length, published, retried, failed };
}

export async function repairOutboxGaps(prisma: PrismaClient) {
  const [imports, callJobs, reservedCalls, rollbacks, orphanTargets] = await Promise.all([
    prisma.importJob.findMany({
      where: { status: 'queued' },
      select: { id: true, organizationId: true },
      take: 500,
    }),
    prisma.callJob.findMany({
      where: { status: 'queued' },
      select: { id: true, organizationId: true },
      take: 500,
    }),
    prisma.realCallExecution.findMany({
      where: { state: 'reserved' },
      select: { id: true, organizationId: true },
      take: 500,
    }),
    prisma.productionTestAuthorization.findMany({
      where: { rollbackStatus: 'requested' },
      select: { id: true, organizationId: true },
      take: 500,
    }),
    prisma.campaignTarget.findMany({
      where: { status: 'queued', jobs: { none: {} } },
      select: { id: true },
      take: 500,
    }),
  ]);
  await prisma.$transaction(async (tx) => {
    for (const row of imports)
      await enqueueOutbox(tx, {
        organizationId: row.organizationId,
        eventType: 'company-import',
        aggregateType: 'import_job',
        aggregateId: row.id,
        payload: { importJobId: row.id, organizationId: row.organizationId },
      });
    for (const row of callJobs)
      await enqueueOutbox(tx, {
        organizationId: row.organizationId,
        eventType: 'mock-call',
        aggregateType: 'call_job',
        aggregateId: row.id,
        payload: { callJobId: row.id, organizationId: row.organizationId },
      });
    for (const row of reservedCalls)
      await enqueueOutbox(tx, {
        organizationId: row.organizationId,
        eventType: 'twilio-call',
        aggregateType: 'real_call_execution',
        aggregateId: row.id,
        payload: { executionId: row.id },
      });
    for (const row of rollbacks)
      await enqueueOutbox(tx, {
        organizationId: row.organizationId,
        eventType: 'twilio-emergency-stop',
        aggregateType: 'production_test_authorization',
        aggregateId: row.id,
        payload: {
          organizationId: row.organizationId,
          scope: 'organization',
          authorizationId: row.id,
        },
      });
    if (orphanTargets.length)
      await tx.campaignTarget.updateMany({
        where: { id: { in: orphanTargets.map((row) => row.id) }, status: 'queued' },
        data: { status: 'pending', reservedAt: null },
      });
  });
  return {
    imports: imports.length,
    mockCalls: callJobs.length,
    twilioCalls: reservedCalls.length,
    emergencyStops: rollbacks.length,
    resetTargets: orphanTargets.length,
  };
}
