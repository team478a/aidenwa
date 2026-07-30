import { type SalesStatus, UserRole } from '@sales-ai/database';
import { normalizeCompanyName } from '@sales-ai/shared/stage2';

import type { AuthContext } from '../../types.js';

export const salesListMutationRoles = [UserRole.admin, UserRole.manager] as const;

export function salesListPreviewScope(
  auth: AuthContext,
  filters: { q?: string; salesStatus?: SalesStatus },
) {
  return {
    organizationId: auth.organizationId,
    isDeleted: false,
    ...(auth.role === UserRole.sales ? { ownerUserId: auth.userId } : {}),
    ...(filters.q ? { normalizedName: { contains: normalizeCompanyName(filters.q) } } : {}),
    ...(filters.salesStatus ? { salesStatus: filters.salesStatus } : {}),
  };
}
