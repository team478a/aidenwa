import { randomUUID } from 'node:crypto';
import type { DuplicatePolicy, PrismaClient } from '@sales-ai/database';
import { findImportJob } from './import.repository.js';
import {
  cancellableImportStatuses,
  executableImportStatuses,
  isImportStateAllowed,
  retryableImportStatuses,
} from './import.policy.js';
import { enqueueImportMapping, enqueueImportProcessing } from './import.outbox.js';

export type ImportServiceResult<T> =
  { ok: true; value: T } | { ok: false; status: number; code: string; message: string };

const missing = (): ImportServiceResult<never> => ({
  ok: false,
  status: 404,
  code: 'NOT_FOUND',
  message: 'インポートが見つかりません',
});
const invalidState = (message: string): ImportServiceResult<never> => ({
  ok: false,
  status: 409,
  code: 'INVALID_STATE',
  message,
});

export async function configureImportMapping(
  prisma: PrismaClient,
  input: {
    id: string;
    organizationId: string;
    mapping: Record<string, string>;
    duplicatePolicy: DuplicatePolicy;
  },
): Promise<ImportServiceResult<Awaited<ReturnType<PrismaClient['importJob']['update']>>>> {
  if (!(await findImportJob(prisma, input.organizationId, input.id))) return missing();
  const importJob = await prisma.$transaction(async (tx) => {
    const updated = await tx.importJob.update({
      where: { id: input.id },
      data: {
        mapping: input.mapping,
        duplicatePolicy: input.duplicatePolicy,
        validRows: 0,
        errorRows: 0,
        status: 'mapping_required',
      },
    });
    await enqueueImportMapping(tx, input.organizationId, input.id);
    return updated;
  });
  return { ok: true, value: importJob };
}

export async function queueImportExecution(
  prisma: PrismaClient,
  organizationId: string,
  id: string,
): Promise<ImportServiceResult<{ id: string; totalRows: number }>> {
  const job = await findImportJob(prisma, organizationId, id);
  if (!job) return missing();
  if (!isImportStateAllowed(job.status, executableImportStatuses))
    return invalidState('実行できない状態です');
  await prisma.$transaction(async (tx) => {
    await tx.importJob.update({ where: { id }, data: { status: 'queued' } });
    await enqueueImportProcessing(tx, organizationId, id);
  });
  return { ok: true, value: { id, totalRows: job.totalRows } };
}

export async function retryFailedImportRows(
  prisma: PrismaClient,
  organizationId: string,
  id: string,
): Promise<ImportServiceResult<{ failedRows: number }>> {
  const job = await findImportJob(prisma, organizationId, id);
  if (!job) return missing();
  if (!isImportStateAllowed(job.status, retryableImportStatuses))
    return invalidState('失敗行を再実行できない状態です');
  const failedRows = await prisma.importRow.count({
    where: { importJobId: id, processingStatus: 'failed' },
  });
  if (!failedRows)
    return {
      ok: false,
      status: 409,
      code: 'NO_FAILED_ROWS',
      message: '再実行対象の失敗行がありません',
    };
  await prisma.$transaction(async (tx) => {
    await tx.importRow.updateMany({
      where: { importJobId: id, processingStatus: 'failed' },
      data: {
        processingStatus: 'pending',
        processedAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
      },
    });
    await tx.importJob.update({
      where: { id },
      data: { status: 'queued', completedAt: null, errorMessage: null },
    });
    await enqueueImportProcessing(tx, organizationId, id, randomUUID(), 'import_job_retry');
  });
  return { ok: true, value: { failedRows } };
}

export async function cancelImport(
  prisma: PrismaClient,
  organizationId: string,
  id: string,
): Promise<ImportServiceResult<{ status: 'cancelled' }>> {
  const result = await prisma.importJob.updateMany({
    where: { id, organizationId, status: { in: [...cancellableImportStatuses] } },
    data: { status: 'cancelled', completedAt: new Date() },
  });
  return result.count
    ? { ok: true, value: { status: 'cancelled' } }
    : invalidState('キャンセルできません');
}
