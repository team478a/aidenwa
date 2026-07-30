import type { PrismaClient } from '@sales-ai/database';
import { salesListInputSchema, salesListPatchSchema } from '@sales-ai/validation';

type SalesListInput = ReturnType<typeof salesListInputSchema.parse>;
type SalesListPatch = ReturnType<typeof salesListPatchSchema.parse>;

function clean<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

export function createSalesList(
  prisma: PrismaClient,
  organizationId: string,
  userId: string,
  input: SalesListInput,
) {
  return prisma.salesList.create({
    data: {
      organizationId,
      createdBy: userId,
      ...clean(input),
      filterConditions: input.filterConditions,
    },
  });
}

export function updateSalesList(prisma: PrismaClient, id: string, input: SalesListPatch) {
  return prisma.salesList.update({
    where: { id },
    data: {
      ...clean(input),
      ...(input.filterConditions ? { filterConditions: input.filterConditions } : {}),
    },
  });
}

export function deleteSalesList(prisma: PrismaClient, id: string) {
  return prisma.salesList.update({ where: { id }, data: { isDeleted: true } });
}

export async function changeSalesListCompanies(
  prisma: PrismaClient,
  salesListId: string,
  companyIds: string[],
  validIds: Set<string>,
  userId: string,
  remove: boolean,
) {
  const results: { companyId: string; success: boolean; error?: string }[] = [];
  for (const companyId of companyIds) {
    if (!validIds.has(companyId)) {
      results.push({ companyId, success: false, error: 'not_found' });
      continue;
    }
    if (remove)
      await prisma.salesListCompany.updateMany({
        where: { salesListId, companyId, removedAt: null },
        data: { removedAt: new Date() },
      });
    else
      await prisma.salesListCompany.upsert({
        where: { salesListId_companyId: { salesListId, companyId } },
        update: { removedAt: null, addedBy: userId, addedAt: new Date() },
        create: { salesListId, companyId, addedBy: userId },
      });
    results.push({ companyId, success: true });
  }
  return results;
}
