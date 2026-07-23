import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@sales-ai/database';
import { processCompanyImport, processImportRow } from './company-import.js';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url:
        process.env.DATABASE_URL ??
        'postgresql://sales_ai:sales_ai_dev@localhost:5432/sales_ai?schema=public',
    },
  },
});
const suffix = `atomic-import-${Date.now().toString(36)}`;
let organizationId = '';
let userId = '';

beforeAll(async () => {
  organizationId = (await prisma.organization.create({ data: { name: suffix, slug: suffix } })).id;
  userId = (
    await prisma.user.create({
      data: {
        organizationId,
        name: 'Import Admin',
        email: `${suffix}@example.test`,
        passwordHash: 'not-used',
        role: 'admin',
        status: 'active',
      },
    })
  ).id;
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { organizationId } });
  await prisma.importJob.deleteMany({ where: { organizationId } });
  await prisma.phoneNumber.deleteMany({ where: { organizationId } });
  await prisma.companyContact.deleteMany({ where: { organizationId } });
  await prisma.company.deleteMany({ where: { organizationId } });
  await prisma.user.deleteMany({ where: { organizationId } });
  await prisma.organization.delete({ where: { id: organizationId } });
  await prisma.$disconnect();
});

async function createImport(name: string, rows: Array<Record<string, string>>) {
  return prisma.importJob.create({
    data: {
      organizationId,
      originalFileName: `${name}.csv`,
      storageKey: `db://${name}`,
      encoding: 'utf8',
      duplicatePolicy: 'create',
      status: 'queued',
      totalRows: rows.length,
      createdBy: userId,
      expiresAt: new Date(Date.now() + 60_000),
      rows: {
        create: rows.map((normalizedData, index) => ({
          rowNumber: index + 2,
          rawData: normalizedData,
          normalizedData,
          action: 'create',
        })),
      },
    },
    include: { rows: true },
  });
}

describe('atomic company import rows', () => {
  it('rolls back the company when a later row operation fails', async () => {
    const job = await createImport('rollback', [
      { name: `${suffix}-rollback`, phone: '0312345678' },
    ]);
    await processImportRow(prisma, job, job.rows[0]!.id, {
      afterCompany: () => {
        throw new Error('simulated_phone_failure');
      },
    });

    expect(
      await prisma.company.count({
        where: { organizationId, normalizedName: `${suffix}-rollback` },
      }),
    ).toBe(0);
    expect(
      await prisma.importRow.findUniqueOrThrow({ where: { id: job.rows[0]!.id } }),
    ).toMatchObject({
      processingStatus: 'failed',
      attemptCount: 1,
      lastErrorCode: 'processing_error',
    });
  });

  it('retries only failed rows and never recreates successful rows', async () => {
    const successfulName = `${suffix}-success`;
    const retryName = `${suffix}-retry`;
    const job = await createImport('retry', [
      { name: successfulName },
      { name: retryName, phone: '0311112222' },
    ]);
    await processImportRow(prisma, job, job.rows[0]!.id);
    await processImportRow(prisma, job, job.rows[1]!.id, {
      afterCompany: () => {
        throw new Error('simulated_phone_failure');
      },
    });

    await prisma.importRow.update({
      where: { id: job.rows[1]!.id },
      data: { processingStatus: 'pending', processedAt: null },
    });
    await processCompanyImport(prisma, { importJobId: job.id, organizationId });

    expect(await prisma.company.count({ where: { organizationId, name: successfulName } })).toBe(1);
    expect(await prisma.company.count({ where: { organizationId, name: retryName } })).toBe(1);
    const rows = await prisma.importRow.findMany({
      where: { importJobId: job.id },
      orderBy: { rowNumber: 'asc' },
    });
    expect(rows.map((row) => [row.processingStatus, row.attemptCount])).toEqual([
      ['success', 1],
      ['success', 2],
    ]);
  });

  it('continues after one invalid row and distinguishes failed and successful results', async () => {
    const job = await createImport('continue', [{ name: '' }, { name: `${suffix}-continued` }]);
    await processCompanyImport(prisma, { importJobId: job.id, organizationId });

    const updated = await prisma.importJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(updated).toMatchObject({
      status: 'completed_with_errors',
      importedRows: 1,
      errorRows: 1,
    });
    const rows = await prisma.importRow.findMany({
      where: { importJobId: job.id },
      orderBy: { rowNumber: 'asc' },
    });
    expect(rows.map((row) => row.processingStatus)).toEqual(['failed', 'success']);
  });
});
