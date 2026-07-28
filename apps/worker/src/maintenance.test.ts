import { Queue, type Job, type JobsOptions } from 'bullmq';
import Redis from 'ioredis';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@sales-ai/database';
import {
  maintenanceDefinitions,
  maintenanceJobNames,
  recordMaintenanceFailure,
  registerMaintenanceSchedulers,
} from './maintenance';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url:
        process.env.DATABASE_URL ??
        'postgresql://sales_ai:sales_ai_dev@localhost:5432/sales_ai?schema=public',
    },
  },
});
let organizationId = '';
let failureJobId = '';

class FakeQueue {
  readonly schedulers = new Map<
    string,
    {
      repeat: { every?: number };
      template?: { name?: string; data?: object; opts?: JobsOptions };
    }
  >();

  upsertJobScheduler(
    id: string,
    repeat: { every?: number },
    template?: { name?: string; data?: object; opts?: JobsOptions },
  ) {
    this.schedulers.set(id, { repeat, template });
    return Promise.resolve({});
  }
}

beforeAll(async () => {
  const suffix = `maintenance-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`;
  organizationId = (await prisma.organization.create({ data: { name: suffix, slug: suffix } })).id;
});

afterAll(async () => {
  if (failureJobId)
    await prisma.productionIncident.deleteMany({
      where: { dedupeKey: `job:maintenance:import-cleanup:${failureJobId}` },
    });
  await prisma.productionIncident.deleteMany({ where: { organizationId } });
  await prisma.organization.delete({ where: { id: organizationId } });
  await prisma.$disconnect();
});

describe('maintenance job scheduling and monitoring', () => {
  it('upserts every required task with retry, backoff and retained history', async () => {
    const queue = new FakeQueue();
    await registerMaintenanceSchedulers(queue as unknown as Queue);
    await registerMaintenanceSchedulers(queue as unknown as Queue);
    expect([...queue.schedulers.keys()].sort()).toEqual([...maintenanceJobNames].sort());
    expect(queue.schedulers.size).toBe(12);
    for (const definition of maintenanceDefinitions()) {
      const scheduler = queue.schedulers.get(definition.name);
      expect(scheduler?.repeat.every).toBe(definition.every);
      expect(scheduler?.template?.name).toBe(definition.name);
      expect(scheduler?.template?.opts).toMatchObject({
        attempts: 3,
        backoff: { type: 'exponential', delay: 1_000 },
        removeOnComplete: 100,
        removeOnFail: 1_000,
      });
      expect(definition.timeoutMs).toBeGreaterThan(0);
    }
  });

  it('creates stable Job Schedulers in Redis and can recreate them after reconnect', async () => {
    const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
    const queueName = `maintenance-test-${crypto.randomUUID()}`;
    const connection = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
    });
    const queue = new Queue(queueName, { connection });
    let recoveredConnection: Redis | undefined;
    let recoveredQueue: Queue | undefined;
    try {
      await registerMaintenanceSchedulers(queue);
      const first = await queue.getJobSchedulers(0, 20, true);
      expect(first.map((item) => item.key).sort()).toEqual([...maintenanceJobNames].sort());
      await queue.close();
      connection.disconnect();
      recoveredConnection = new Redis(redisUrl, { maxRetriesPerRequest: null });
      recoveredQueue = new Queue(queueName, { connection: recoveredConnection });
      await registerMaintenanceSchedulers(recoveredQueue);
      const recovered = await recoveredQueue.getJobSchedulers(0, 20, true);
      expect(recovered.map((item) => item.key).sort()).toEqual([...maintenanceJobNames].sort());
    } finally {
      const cleanupQueue = recoveredQueue ?? queue;
      for (const name of maintenanceJobNames) await cleanupQueue.removeJobScheduler(name);
      await cleanupQueue.close();
      recoveredConnection?.disconnect();
      connection.disconnect();
    }
  });

  it('retains retry failures and creates one sanitized incident only at exhaustion', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    failureJobId = crypto.randomUUID();
    const base = {
      name: 'maintenance:import-cleanup',
      id: failureJobId,
      opts: { attempts: 3 },
    };
    await recordMaintenanceFailure(
      prisma,
      { ...base, attemptsMade: 1 } as unknown as Job,
      new Error('database_url=secret'),
    );
    expect(
      await prisma.productionIncident.count({
        where: { dedupeKey: `job:maintenance:import-cleanup:${failureJobId}` },
      }),
    ).toBe(0);
    const exhausted = { ...base, attemptsMade: 3 } as unknown as Job;
    await recordMaintenanceFailure(prisma, exhausted, new TypeError('database_url=secret'));
    await recordMaintenanceFailure(prisma, exhausted, new TypeError('database_url=secret'));
    const incidents = await prisma.productionIncident.findMany({
      where: { dedupeKey: `job:maintenance:import-cleanup:${failureJobId}` },
    });
    expect(incidents).toHaveLength(1);
    expect(JSON.stringify(incidents[0]?.sanitizedDetails)).toContain('TypeError');
    expect(JSON.stringify(incidents[0])).not.toContain('database_url=secret');
    errorSpy.mockRestore();
  });
});
