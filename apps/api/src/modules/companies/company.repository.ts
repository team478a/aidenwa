import { Prisma, type PrismaClient } from '@sales-ai/database';
import { normalizeCompanyName, normalizePhoneNumber } from '@sales-ai/shared/stage2';
import { companyQuerySchema } from '@sales-ai/validation';

import type { AuthContext } from '../../types.js';
import { companyScope } from './company.policy.js';

type CompanyQuery = ReturnType<typeof companyQuerySchema.parse>;

export const companyDetailInclude = {
  owner: { select: { id: true, name: true, email: true } },
  contacts: { where: { isDeleted: false } },
  phoneNumbers: {
    where: { isDeleted: false },
    orderBy: [{ isPrimary: 'desc' as const }, { createdAt: 'asc' as const }],
  },
  companyTags: { include: { tag: true } },
  listCompanies: { where: { removedAt: null }, include: { salesList: true } },
  optOuts: { orderBy: { registeredAt: 'desc' as const } },
};

export function companyWhere(auth: AuthContext, q: CompanyQuery): Prisma.CompanyWhereInput {
  return {
    ...companyScope(auth),
    ...(q.q
      ? {
          OR: [
            { name: { contains: q.q, mode: 'insensitive' as const } },
            { normalizedName: { contains: normalizeCompanyName(q.q) } },
          ],
        }
      : {}),
    ...(q.phone
      ? {
          phoneNumbers: {
            some: {
              normalizedNumber: normalizePhoneNumber(q.phone).normalizedNumber,
              isDeleted: false,
            },
          },
        }
      : {}),
    ...(q.corporateNumber ? { corporateNumber: q.corporateNumber } : {}),
    ...(q.domain ? { websiteUrl: { contains: q.domain, mode: 'insensitive' } } : {}),
    ...(q.prefecture ? { prefecture: q.prefecture } : {}),
    ...(q.city ? { city: { contains: q.city } } : {}),
    ...(q.industry ? { industryName: { contains: q.industry } } : {}),
    ...(q.salesStatus ? { salesStatus: q.salesStatus } : {}),
    ...(q.ownerUserId ? { ownerUserId: q.ownerUserId } : {}),
    ...(q.tagId ? { companyTags: { some: { tagId: q.tagId } } } : {}),
    ...(q.isCustomer ? { isCustomer: q.isCustomer === 'true' } : {}),
    ...(q.optOut
      ? {
          optOuts:
            q.optOut === 'true' ? { some: { status: 'active' } } : { none: { status: 'active' } },
        }
      : {}),
  };
}

export async function listCompanies(prisma: PrismaClient, auth: AuthContext, q: CompanyQuery) {
  const where = companyWhere(auth, q);
  const [total, companies] = await prisma.$transaction([
    prisma.company.count({ where }),
    prisma.company.findMany({
      where,
      include: {
        owner: { select: { id: true, name: true } },
        phoneNumbers: { where: { isDeleted: false }, orderBy: { isPrimary: 'desc' }, take: 1 },
        contacts: { where: { isDeleted: false }, take: 1 },
        companyTags: { include: { tag: true } },
        optOuts: { where: { status: 'active' }, take: 1 },
      },
      orderBy: { [q.sortBy]: q.sortOrder },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
  ]);
  return { companies, total };
}

export function findCompany(prisma: PrismaClient, auth: AuthContext, id: string) {
  return prisma.company.findFirst({ where: { id, ...companyScope(auth) } });
}

export function findCompanyDetail(prisma: PrismaClient, auth: AuthContext, id: string) {
  return prisma.company.findFirst({
    where: { id, ...companyScope(auth) },
    include: companyDetailInclude,
  });
}

export async function isValidOwner(
  prisma: PrismaClient,
  organizationId: string,
  id?: string | null,
) {
  if (!id) return true;
  return Boolean(await prisma.user.findFirst({ where: { id, organizationId, status: 'active' } }));
}
