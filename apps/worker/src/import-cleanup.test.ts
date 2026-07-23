import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@sales-ai/database';
import { cleanupExpiredImports } from './import-cleanup';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://sales_ai:sales_ai_dev@localhost:5432/sales_ai?schema=public';
const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const suffix = `cleanup-${Date.now().toString(36)}`;
let organizationId = '';
let userId = '';

beforeAll(async () => {
  const organization = await prisma.organization.create({ data: { name: suffix, slug: suffix } });
  organizationId = organization.id;
  const user = await prisma.user.create({
    data: {
      organizationId,
      name: 'Cleanup User',
      email: `${suffix}@example.test`,
      passwordHash: 'not-used',
      role: 'admin',
      status: 'active',
    },
  });
  userId = user.id;
});

afterAll(async () => {
  await prisma.importJob.deleteMany({ where: { organizationId } });
  await prisma.user.deleteMany({ where: { organizationId } });
  await prisma.organization.delete({ where: { id: organizationId } });
  await prisma.$disconnect();
});

describe('expired import cleanup', () => {
  it('deletes payload rows for expired completed and abnormal processing jobs but retains live jobs', async () => {
    const base = {
      organizationId,
      originalFileName: 'sensitive.csv',
      storageKey: 'db://temporary',
      encoding: 'utf8',
      createdBy: userId,
      totalRows: 1,
      rows: {
        create: { rowNumber: 2, rawData: { email: 'secret@example.test' }, normalizedData: {} },
      },
    };
    const expired = new Date(Date.now() - 60_000);
    const future = new Date(Date.now() + 60_000);
    const completed = await prisma.importJob.create({
      data: { ...base, status: 'completed', expiresAt: expired },
    });
    const abandoned = await prisma.importJob.create({
      data: { ...base, storageKey: 'db://abandoned', status: 'processing', expiresAt: expired },
    });
    const live = await prisma.importJob.create({
      data: { ...base, storageKey: 'db://live', status: 'processing', expiresAt: future },
    });

    const cleanupAt = new Date();
    const expectedDeletedCount = await prisma.importJob.count({
      where: { expiresAt: { lt: cleanupAt } },
    });
    const result = await cleanupExpiredImports(prisma, cleanupAt);

    expect(expectedDeletedCount).toBeGreaterThanOrEqual(2);
    expect(result.count).toBe(expectedDeletedCount);
    expect(
      await prisma.importJob.findMany({
        where: { id: { in: [completed.id, abandoned.id, live.id] } },
        select: { id: true },
      }),
    ).toEqual([{ id: live.id }]);
    expect(
      await prisma.importRow.count({
        where: { importJobId: { in: [completed.id, abandoned.id] } },
      }),
    ).toBe(0);
  });
});
