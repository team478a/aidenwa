import type { PrismaClient } from '@sales-ai/database';
import type { ImportReadMode } from './import.types.js';

export function findImportJob(prisma: PrismaClient, organizationId: string, id: string) {
  return prisma.importJob.findFirst({ where: { id, organizationId } });
}

export function findImportRows(prisma: PrismaClient, id: string, mode: ImportReadMode) {
  return prisma.importRow.findMany({
    where: {
      importJobId: id,
      ...(mode === 'errors' ? { NOT: { validationErrors: { equals: [] } } } : {}),
    },
    orderBy: { rowNumber: 'asc' },
    take: mode === 'preview' ? 100 : 1000,
  });
}
