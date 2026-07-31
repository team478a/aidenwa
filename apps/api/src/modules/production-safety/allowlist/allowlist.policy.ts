import { UserRole } from '@sales-ai/database';

export const allowlistReadRoles = [
  UserRole.system_admin,
  UserRole.admin,
  UserRole.manager,
] as const;
export const allowlistMutationRoles = [UserRole.system_admin, UserRole.admin] as const;

export function resolveAllowlistOrganization(
  auth: { role: UserRole; organizationId: string },
  requested?: string,
) {
  return auth.role === UserRole.system_admin && requested ? requested : auth.organizationId;
}

export function maskedPhone(lastFour: string) {
  return `********${lastFour}`;
}
