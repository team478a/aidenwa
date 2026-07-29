import type { Job } from 'bullmq';
import type { PrismaClient } from '@sales-ai/database';
import { processCompanyImport } from './import-engine.js';
import { parseImportJobData } from './import-job.types.js';

export async function processImportProcessingJob(job: Job, prisma: PrismaClient) {
  await processCompanyImport(prisma, parseImportJobData(job.data));
}
