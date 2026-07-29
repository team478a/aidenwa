import type { Job } from 'bullmq';
import type { PrismaClient } from '@sales-ai/database';
import { processImportProcessingJob } from './processing.job.js';

export async function processImportRetryJob(job: Job, prisma: PrismaClient) {
  await processImportProcessingJob(job, prisma);
}
