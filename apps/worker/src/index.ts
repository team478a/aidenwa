import { Worker, type Job } from 'bullmq';
import Redis from 'ioredis';
import { PrismaClient } from '@sales-ai/database';
import {
  normalizeCompanyName,
  normalizeEmail,
  normalizePhoneNumber,
} from '@sales-ai/shared/stage2';
import { workerEnvSchema } from '@sales-ai/validation/env';
import { cleanupExpiredImports } from './import-cleanup.js';
import { processMockCall, recoverStuckReservations } from './mock-call.js';
import { processProviderWebhook } from './provider-webhook.js';
import { cleanupRealtimeData } from './realtime-cleanup.js';
import { reopenSnoozedFollowups } from './followup.js';
import { cleanupExpiredHandoffs } from './handoff-cleanup.js';
import { maintainAppointments } from './appointment.js';
import {
  expireTwilioAuthorizations,
  processTwilioCall,
  reconcileTwilioCosts,
  stopTwilioExecutions,
} from './twilio-call.js';

const env = workerEnvSchema.parse(process.env);
const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
const prisma = new PrismaClient({
  datasources: {
    db: {
      url:
        process.env.DATABASE_URL ??
        'postgresql://sales_ai:sales_ai_dev@localhost:5432/sales_ai?schema=public',
    },
  },
});

async function processor(job: Job) {
  if (job.name === 'twilio-emergency-stop') {
    const data = job.data as {
      organizationId?: string | null;
      scope?: 'system' | 'organization' | 'campaign' | 'product' | 'provider';
      scopeId?: string | null;
      authorizationId?: string;
    };
    await stopTwilioExecutions(prisma, env, data);
    return;
  }
  if (job.name === 'twilio-call') {
    const data = job.data as { executionId: string };
    await processTwilioCall(prisma, env, data.executionId);
    return;
  }
  if (job.name === 'provider-webhook') {
    const data = job.data as { eventId: string };
    await processProviderWebhook(prisma, data.eventId);
    return;
  }
  if (job.name === 'mock-call') {
    const data = job.data as { callJobId: string; organizationId: string };
    await processMockCall(prisma, data.callJobId, data.organizationId);
    return;
  }
  if (job.name !== 'company-import') return;
  const data = job.data as { importJobId: string; organizationId: string };
  const importJob = await prisma.importJob.findFirst({
    where: { id: data.importJobId, organizationId: data.organizationId },
  });
  if (!importJob || ['completed', 'completed_with_errors', 'cancelled'].includes(importJob.status))
    return;
  await prisma.importJob.update({
    where: { id: importJob.id },
    data: { status: 'processing', startedAt: new Date(), errorMessage: null },
  });
  const rows = await prisma.importRow.findMany({
    where: { importJobId: importJob.id },
    orderBy: { rowNumber: 'asc' },
  });
  let imported = 0;
  let skipped = 0;
  let errors = 0;
  for (const row of rows) {
    if (row.processedAt) {
      if (row.resultCompanyId) imported += 1;
      else skipped += 1;
      continue;
    }
    const normalized = row.normalizedData as Record<string, string>;
    const candidates = row.duplicateCandidates as Array<{ companyId?: string }>;
    try {
      if (['skip', 'review', 'error'].includes(row.action)) {
        skipped += 1;
        if (row.action === 'error') errors += 1;
        await prisma.importRow.update({ where: { id: row.id }, data: { processedAt: new Date() } });
        continue;
      }
      const existingId = candidates[0]?.companyId;
      let companyId: string;
      if (existingId && (row.action === 'update' || row.action === 'fill_blank')) {
        const existing = await prisma.company.findFirst({
          where: { id: existingId, organizationId: importJob.organizationId, isDeleted: false },
        });
        if (!existing) throw new Error('duplicate_candidate_missing');
        const values = companyValues(normalized);
        const update =
          row.action === 'fill_blank'
            ? Object.fromEntries(
                Object.entries(values).filter(
                  ([key, value]) => value && !existing[key as keyof typeof existing],
                ),
              )
            : values;
        await prisma.company.update({ where: { id: existing.id }, data: update });
        companyId = existing.id;
      } else {
        const companyName = normalized.name;
        if (!companyName) throw new Error('name_required');
        const company = await prisma.company.create({
          data: {
            organizationId: importJob.organizationId,
            name: companyName,
            normalizedName: normalizeCompanyName(companyName),
            ...companyValues(normalized),
            sourceType: normalized.sourceType || 'csv_import',
            sourceMetadata: { importJobId: importJob.id, rowNumber: row.rowNumber },
          },
        });
        companyId = company.id;
      }
      if (normalized.phone) {
        const phone = normalizePhoneNumber(normalized.phone);
        await prisma.phoneNumber.create({
          data: {
            organizationId: importJob.organizationId,
            companyId,
            ...phone,
            type: phoneType(normalized.phoneType),
            isCallable: normalized.phoneType !== 'fax' && phone.isValid,
            isPrimary: true,
          },
        });
      }
      if (normalized.contactName)
        await prisma.companyContact.create({
          data: {
            organizationId: importJob.organizationId,
            companyId,
            name: normalized.contactName,
            department: normalized.department || null,
            position: normalized.position || null,
            email: normalizeEmail(normalized.email),
            sourceType: 'csv_import',
          },
        });
      await prisma.importRow.update({
        where: { id: row.id },
        data: { resultCompanyId: companyId, processedAt: new Date() },
      });
      imported += 1;
    } catch (cause) {
      errors += 1;
      await prisma.importRow.update({
        where: { id: row.id },
        data: {
          action: 'error',
          validationErrors: [cause instanceof Error ? cause.message : 'processing_error'],
          processedAt: new Date(),
        },
      });
    }
  }
  const status = errors ? 'completed_with_errors' : 'completed';
  await prisma.$transaction([
    prisma.importJob.update({
      where: { id: importJob.id },
      data: {
        status,
        importedRows: imported,
        skippedRows: skipped,
        errorRows: errors,
        completedAt: new Date(),
      },
    }),
    prisma.auditLog.create({
      data: {
        organizationId: importJob.organizationId,
        userId: importJob.createdBy,
        action: 'import.completed',
        entityType: 'import_job',
        entityId: importJob.id,
        afterData: {
          totalRows: rows.length,
          importedRows: imported,
          skippedRows: skipped,
          errorRows: errors,
        },
      },
    }),
  ]);
}

const worker = new Worker('sales-ai-jobs', processor, {
  connection,
  concurrency: env.MOCK_WORKER_CONCURRENCY,
});
async function writeHealth() {
  await connection.set(
    env.WORKER_HEALTH_KEY,
    JSON.stringify({ service: 'worker', status: 'ok', timestamp: new Date().toISOString() }),
    'EX',
    15,
  );
}
await writeHealth();
const healthTimer = setInterval(() => void writeHealth(), 5_000);
const cleanupTimer = setInterval(
  () =>
    void Promise.all([
      cleanupExpiredImports(prisma),
      recoverStuckReservations(
        prisma,
        new Date(Date.now() - env.STUCK_RESERVATION_MINUTES * 60_000),
      ),
      prisma.callEvent.deleteMany({
        where: {
          eventAt: { lt: new Date(Date.now() - env.CALL_EVENT_RETENTION_DAYS * 86_400_000) },
        },
      }),
      cleanupRealtimeData(prisma, {
        staleBefore: new Date(Date.now() - env.REALTIME_STALE_SESSION_MINUTES * 60_000),
        eventBefore: new Date(Date.now() - env.CALL_EVENT_RETENTION_DAYS * 86_400_000),
      }),
      reopenSnoozedFollowups(prisma),
      cleanupExpiredHandoffs(prisma),
      maintainAppointments(prisma),
      expireTwilioAuthorizations(prisma),
      ...(env.VOICE_PROVIDER === 'twilio' && env.PRODUCTION_CALLS_ENABLED
        ? [reconcileTwilioCosts(prisma, env)]
        : []),
    ]),
  60 * 60 * 1000,
);
async function shutdown() {
  clearInterval(healthTimer);
  clearInterval(cleanupTimer);
  await connection.del(env.WORKER_HEALTH_KEY);
  await worker.close();
  await prisma.$disconnect();
  connection.disconnect();
}
process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());

function companyValues(row: Record<string, string>) {
  return {
    ...(row.corporateNumber ? { corporateNumber: row.corporateNumber } : {}),
    ...(row.nameKana ? { nameKana: row.nameKana } : {}),
    ...(row.postalCode ? { postalCode: row.postalCode } : {}),
    ...(row.prefecture ? { prefecture: row.prefecture } : {}),
    ...(row.city ? { city: row.city } : {}),
    ...(row.address ? { address: row.address } : {}),
    ...(row.websiteUrl ? { websiteUrl: row.websiteUrl } : {}),
    ...(row.inquiryUrl ? { inquiryUrl: row.inquiryUrl } : {}),
    ...(row.industryName ? { industryName: row.industryName } : {}),
  };
}
function phoneType(
  value: string | undefined,
): 'representative' | 'department' | 'store' | 'direct' | 'mobile' | 'fax' | 'unknown' {
  return ['representative', 'department', 'store', 'direct', 'mobile', 'fax'].includes(value ?? '')
    ? (value as 'representative' | 'department' | 'store' | 'direct' | 'mobile' | 'fax')
    : 'unknown';
}
