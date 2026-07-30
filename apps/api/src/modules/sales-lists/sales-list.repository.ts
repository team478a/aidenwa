import type { Prisma, PrismaClient } from '@sales-ai/database';

export function listSalesLists(prisma: PrismaClient, organizationId: string) {
  return prisma.salesList.findMany({
    where: { organizationId, isDeleted: false },
    include: {
      creator: { select: { id: true, name: true } },
      _count: { select: { companies: { where: { removedAt: null } } } },
    },
    orderBy: { updatedAt: 'desc' },
  });
}

export function findSalesList(prisma: PrismaClient, organizationId: string, id: string) {
  return prisma.salesList.findFirst({
    where: { id, organizationId, isDeleted: false },
  });
}

export function listSalesListCompanies(prisma: PrismaClient, salesListId: string) {
  return prisma.salesListCompany.findMany({
    where: { salesListId, removedAt: null },
    include: { company: true },
  });
}

export function findValidCompanyIds(
  prisma: PrismaClient,
  organizationId: string,
  companyIds: string[],
) {
  return prisma.company.findMany({
    where: { id: { in: companyIds }, organizationId, isDeleted: false },
    select: { id: true },
  });
}

export function previewCompanies(prisma: PrismaClient, where: Prisma.CompanyWhereInput) {
  return prisma.company.findMany({ where, take: 100 });
}
