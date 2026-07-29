import type { Prisma } from '@sales-ai/database';
import { enqueueOutbox } from '../../outbox.js';

export function enqueueImportMapping(
  tx: Prisma.TransactionClient,
  organizationId: string,
  importJobId: string,
) {
  return enqueueOutbox(tx, {
    organizationId,
    eventType: 'company-import-mapping',
    aggregateType: 'import_job',
    aggregateId: importJobId,
    payload: { importJobId, organizationId },
  });
}

export function enqueueImportProcessing(
  tx: Prisma.TransactionClient,
  organizationId: string,
  importJobId: string,
  aggregateId = importJobId,
  aggregateType = 'import_job',
) {
  return enqueueOutbox(tx, {
    organizationId,
    eventType: 'company-import',
    aggregateType,
    aggregateId,
    payload: { importJobId, organizationId },
  });
}
