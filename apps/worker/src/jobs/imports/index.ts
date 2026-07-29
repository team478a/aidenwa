import type { Job } from 'bullmq';
import type { PrismaClient } from '@sales-ai/database';
import { processImportMappingJob } from './mapping.job.js';
import { processImportProcessingJob } from './processing.job.js';

export async function processImportJob(job: Job, prisma: PrismaClient): Promise<boolean> {
  if (job.name === 'company-import-mapping') {
    await processImportMappingJob(job, prisma);
    return true;
  }
  if (job.name === 'company-import') {
    await processImportProcessingJob(job, prisma);
    return true;
  }
  return false;
}
