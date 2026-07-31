import type { Queue } from 'bullmq';
import type { PrismaClient } from '@sales-ai/database';
import { publishOutboxBatch, repairOutboxGaps } from '../../outbox.js';

export async function runOutboxPublishJob(prisma: PrismaClient, queue: Queue) {
  await repairOutboxGaps(prisma);
  await publishOutboxBatch(prisma, queue);
}
