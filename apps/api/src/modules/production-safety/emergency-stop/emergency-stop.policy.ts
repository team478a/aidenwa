import { UserRole } from '@sales-ai/database';

export const emergencyStopReadRoles = [
  UserRole.system_admin,
  UserRole.admin,
  UserRole.manager,
] as const;
export const emergencyStopActivationRoles = [UserRole.system_admin, UserRole.admin] as const;
export const emergencyStopReleaseRoles = [UserRole.system_admin] as const;

export function canActivateSystemStop(role: UserRole) {
  return role === UserRole.system_admin;
}

export function resolveStopOrganization(
  auth: { role: UserRole; organizationId: string },
  scope: string,
  requestedOrganizationId?: string,
) {
  if (scope === 'system') return null;
  return auth.role === UserRole.system_admin && requestedOrganizationId
    ? requestedOrganizationId
    : auth.organizationId;
}
