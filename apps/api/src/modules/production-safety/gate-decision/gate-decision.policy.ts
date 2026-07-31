import { UserRole } from '@sales-ai/database';
export const gateRoles = [UserRole.system_admin, UserRole.admin, UserRole.manager] as const;
export function resolveGateOrganization(
  auth: { role: UserRole; organizationId: string },
  requested?: string,
) {
  return auth.role === UserRole.system_admin && requested ? requested : auth.organizationId;
}
