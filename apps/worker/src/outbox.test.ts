import { randomUUID } from 'node:crypto';
import type { JobsOptions } from 'bullmq';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { enqueueOutbox, PrismaClient } from '@sales-ai/database';
import { publishOutboxBatch, repairOutboxGaps } from './outbox.js';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://sales_ai:sales_ai_dev@localhost:5432/sales_ai?schema=public';
const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const suffix = `outbox-${Date.now().toString(36)}`;
let organizationId = '';
let userId = '';
let companyId = '';
let campaignId = '';
let targetId = '';

class FakeQueue {
  fail = false;
  calls: Array<{ name: string; data: object; options: JobsOptions }> = [];
  add(name: string, data: object, options: JobsOptions) {
    this.calls.push({ name, data, options });
    if (this.fail) return Promise.reject(new Error('redis_unavailable'));
    return Promise.resolve({ id: options.jobId });
  }
}

beforeAll(async () => {
  const organization = await prisma.organization.create({
    data: { name: suffix, slug: suffix },
  });
  organizationId = organization.id;
  userId = (
    await prisma.user.create({
      data: {
        organizationId,
        name: 'Outbox Admin',
        email: `${suffix}@example.test`,
        passwordHash: 'not-used',
        role: 'admin',
        status: 'active',
      },
    })
  ).id;
  companyId = (
    await prisma.company.create({
      data: { organizationId, name: suffix, normalizedName: suffix },
    })
  ).id;
  const phone = await prisma.phoneNumber.create({
    data: {
      organizationId,
      companyId,
      rawNumber: '0312345678',
      normalizedNumber: `03${Date.now().toString().slice(-8)}`,
      type: 'representative',
      isCallable: true,
    },
  });
  campaignId = (
    await prisma.campaign.create({
      data: {
        organizationId,
        name: suffix,
        productVersionId: randomUUID(),
        aiAgentVersionId: randomUUID(),
        scenarioVersionId: randomUUID(),
        salesListId: randomUUID(),
        createdBy: userId,
        status: 'running',
      },
    })
  ).id;
  targetId = (
    await prisma.campaignTarget.create({
      data: {
        organizationId,
        campaignId,
        companyId,
        phoneNumberId: phone.id,
        status: 'queued',
      },
    })
  ).id;
});

afterAll(async () => {
  await prisma.outboxEvent.deleteMany({ where: { organizationId } });
  await prisma.realCallExecution.deleteMany({ where: { organizationId } });
  await prisma.productionTestAuthorization.deleteMany({ where: { organizationId } });
  await prisma.importJob.deleteMany({ where: { organizationId } });
  await prisma.callJob.deleteMany({ where: { organizationId } });
  await prisma.campaignTarget.deleteMany({ where: { organizationId } });
  await prisma.campaign.deleteMany({ where: { organizationId } });
  await prisma.phoneNumber.deleteMany({ where: { organizationId } });
  await prisma.company.deleteMany({ where: { organizationId } });
  await prisma.user.deleteMany({ where: { organizationId } });
  await prisma.organization.delete({ where: { id: organizationId } });
  await prisma.$disconnect();
});

describe('transactional outbox', () => {
  it('rolls back business data and its outbox event together', async () => {
    const importId = randomUUID();
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.importJob.create({
          data: {
            id: importId,
            organizationId,
            originalFileName: 'rollback.csv',
            storageKey: 'db://rollback',
            encoding: 'utf8',
            createdBy: userId,
            expiresAt: new Date(Date.now() + 60_000),
          },
        });
        await enqueueOutbox(tx, {
          organizationId,
          eventType: 'company-import',
          aggregateType: 'import_job',
          aggregateId: importId,
          payload: { importJobId: importId, organizationId },
        });
        throw new Error('force_rollback');
      }),
    ).rejects.toThrow('force_rollback');
    expect(await prisma.importJob.count({ where: { id: importId } })).toBe(0);
    expect(
      await prisma.outboxEvent.count({
        where: { eventType: 'company-import', aggregateId: importId },
      }),
    ).toBe(0);
  });

  it('retries after queue failure and publishes once with a stable BullMQ job id', async () => {
    const aggregateId = randomUUID();
    const firstAttemptAt = new Date('2026-07-24T00:00:00Z');
    await enqueueOutbox(prisma, {
      organizationId,
      eventType: 'company-import',
      aggregateType: 'import_job',
      aggregateId,
      payload: { importJobId: aggregateId, organizationId },
    });
    await prisma.outboxEvent.update({
      where: { eventType_aggregateId: { eventType: 'company-import', aggregateId } },
      data: { availableAt: new Date(firstAttemptAt.getTime() - 1000) },
    });
    const queue = new FakeQueue();
    queue.fail = true;
    const first = await publishOutboxBatch(prisma, queue, firstAttemptAt);
    expect(first.published).toBe(0);
    expect(first.retried).toBeGreaterThanOrEqual(1);
    expect(
      await prisma.outboxEvent.findUniqueOrThrow({
        where: { eventType_aggregateId: { eventType: 'company-import', aggregateId } },
      }),
    ).toMatchObject({ status: 'pending', attemptCount: 1 });
    queue.fail = false;
    const second = await publishOutboxBatch(
      prisma,
      queue,
      new Date(firstAttemptAt.getTime() + 2000),
    );
    expect(second.published).toBeGreaterThanOrEqual(1);
    await publishOutboxBatch(prisma, queue, new Date(firstAttemptAt.getTime() + 3000));
    expect(
      queue.calls.map((call) => call.options.jobId).filter((id) => id?.endsWith(aggregateId)),
    ).toEqual([`company-import-${aggregateId}`, `company-import-${aggregateId}`]);
  });

  it('recovers a stale publishing lock after a worker restart', async () => {
    const aggregateId = randomUUID();
    await prisma.outboxEvent.create({
      data: {
        organizationId,
        eventType: 'mock-call',
        aggregateType: 'call_job',
        aggregateId,
        payload: { callJobId: aggregateId, organizationId },
        status: 'publishing',
        lockedAt: new Date('2026-07-23T23:00:00Z'),
      },
    });
    const queue = new FakeQueue();
    const result = await publishOutboxBatch(prisma, queue, new Date('2026-07-24T00:00:00Z'));
    expect(result.published).toBe(1);
    expect(queue.calls[0]?.options.jobId).toBe(`mock-call-${aggregateId}`);
  });

  it('repairs all legacy gap categories and resets an orphan queued target', async () => {
    const orphanTarget = await prisma.campaignTarget.create({
      data: {
        organizationId,
        campaignId,
        companyId,
        status: 'queued',
      },
    });
    const importJob = await prisma.importJob.create({
      data: {
        organizationId,
        originalFileName: 'repair.csv',
        storageKey: 'db://repair',
        encoding: 'utf8',
        createdBy: userId,
        status: 'queued',
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    const callJob = await prisma.callJob.create({
      data: {
        organizationId,
        campaignId,
        campaignTargetId: targetId,
        idempotencyKey: `${suffix}:repair`,
        status: 'queued',
      },
    });
    const authorization = await prisma.productionTestAuthorization.create({
      data: {
        organizationId,
        releaseCommit: 'a'.repeat(40),
        writtenApprovalCommit: 'b'.repeat(40),
        startsAt: new Date(Date.now() - 60_000),
        endsAt: new Date(Date.now() + 60_000),
        budgetLimitMinor: 500,
        createdBy: userId,
        rollbackStatus: 'requested',
      },
    });
    const execution = await prisma.realCallExecution.create({
      data: {
        organizationId,
        authorizationId: authorization.id,
        campaignId,
        companyId,
        phoneNumberId: randomUUID(),
        allowlistId: randomUUID(),
        idempotencyKey: `${suffix}:execution`,
        estimatedCostMinor: 100,
        reservedCostMinor: 100,
        currency: 'JPY',
        state: 'reserved',
      },
    });

    const result = await repairOutboxGaps(prisma);

    expect(result.imports).toBeGreaterThanOrEqual(1);
    expect(result.mockCalls).toBeGreaterThanOrEqual(1);
    expect(result.twilioCalls).toBeGreaterThanOrEqual(1);
    expect(result.emergencyStops).toBeGreaterThanOrEqual(1);
    expect(result.resetTargets).toBeGreaterThanOrEqual(1);
    expect(
      await prisma.outboxEvent.count({
        where: {
          OR: [
            { eventType: 'company-import', aggregateId: importJob.id },
            { eventType: 'mock-call', aggregateId: callJob.id },
            { eventType: 'twilio-call', aggregateId: execution.id },
            { eventType: 'twilio-emergency-stop', aggregateId: authorization.id },
          ],
        },
      }),
    ).toBe(4);
    expect(
      (await prisma.campaignTarget.findUniqueOrThrow({ where: { id: orphanTarget.id } })).status,
    ).toBe('pending');
  });
});
