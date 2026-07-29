import type { Job } from 'bullmq';
import type { PrismaClient } from '@sales-ai/database';
import { mapCompanyImport } from './import-engine.js';
import { parseImportJobData } from './import-job.types.js';

export async function processImportMappingJob(job: Job, prisma: PrismaClient) {
  await mapCompanyImport(prisma, parseImportJobData(job.data));
}
