import type { Job } from 'bullmq';
import type { PrismaClient } from '@sales-ai/database';
import { maintenanceJobNames, type MaintenanceJobName } from './registry.js';

const HOUR = 60 * 60 * 1_000;

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
