import { UserRole } from '@sales-ai/database';
import type { AuthContext } from '../../types.js';

export const appointmentRoles = [UserRole.admin, UserRole.manager, UserRole.sales] as const;

export function canAccessAssignee(auth: AuthContext, assigneeUserId: string) {
  return auth.role !== UserRole.sales || auth.userId === assigneeUserId;
}

export function appointmentScope(auth: AuthContext, id?: string) {
  return {
    ...(id ? { id } : {}),
    organizationId: auth.organizationId,
    ...(auth.role === UserRole.sales ? { assigneeUserId: auth.userId } : {}),
  };
}
