import { Prisma, type PrismaClient, UserRole } from '@sales-ai/database';
import { normalizeCompanyName } from '@sales-ai/shared/stage2';
import { companyInputSchema, companyPatchSchema } from '@sales-ai/validation';

import type { AuthContext } from '../../types.js';

type CompanyInput = ReturnType<typeof companyInputSchema.parse>;
type CompanyPatch = ReturnType<typeof companyPatchSchema.parse>;

function clean<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

export function createCompany(prisma: PrismaClient, auth: AuthContext, input: CompanyInput) {
  const data: Prisma.CompanyUncheckedCreateInput = {
    organizationId: auth.organizationId,
    ...clean(input),
    name: input.name,
    normalizedName: normalizeCompanyName(input.name),
    ownerUserId: auth.role === UserRole.sales ? auth.userId : input.ownerUserId,
  };
  return prisma.company.create({ data });
}

export function updateCompany(prisma: PrismaClient, id: string, input: CompanyPatch) {
  return prisma.company.update({
    where: { id },
    data: {
      ...clean(input),
      ...(input.name ? { normalizedName: normalizeCompanyName(input.name) } : {}),
    },
  });
}

export function deleteCompany(prisma: PrismaClient, id: string) {
  return prisma.company.update({ where: { id }, data: { isDeleted: true } });
}
