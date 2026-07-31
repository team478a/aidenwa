import { UserRole } from '@sales-ai/database';

export const productionPolicyReadRoles = [
  UserRole.system_admin,
  UserRole.admin,
  UserRole.manager,
] as const;
export const productionPolicyMutationRoles = [UserRole.system_admin, UserRole.admin] as const;

export function resolvePolicyOrganization(
  auth: { role: UserRole; organizationId: string },
  requestedOrganizationId?: string,
) {
  return auth.role === UserRole.system_admin && requestedOrganizationId
    ? requestedOrganizationId
    : auth.organizationId;
}

export function policyAuditProjection(policy: {
  dailyCallLimit: number;
  hourlyCallLimit: number;
  concurrentCallLimit: number;
}) {
  return {
    limits: {
      daily: policy.dailyCallLimit,
      hourly: policy.hourlyCallLimit,
      concurrent: policy.concurrentCallLimit,
    },
  };
}
