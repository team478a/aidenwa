import { UserRole } from '@sales-ai/database';

export const readinessReadRoles = [
  UserRole.system_admin,
  UserRole.admin,
  UserRole.manager,
] as const;

export function resolveReadinessOrganization(
  auth: { role: UserRole; organizationId: string },
  requestedOrganizationId?: string,
) {
  return auth.role === UserRole.system_admin && requestedOrganizationId
    ? requestedOrganizationId
    : auth.organizationId;
}
