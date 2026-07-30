import { Prisma, UserRole } from '@sales-ai/database';

import type { AuthContext } from '../../types.js';

export function companyScope(auth: AuthContext): Prisma.CompanyWhereInput {
  return {
    organizationId: auth.organizationId,
    isDeleted: false,
    ...(auth.role === UserRole.sales ? { ownerUserId: auth.userId } : {}),
  };
}

export function canAssignCompanyOwner(auth: AuthContext, ownerUserId?: string | null) {
  return auth.role !== UserRole.sales || !ownerUserId || ownerUserId === auth.userId;
}
