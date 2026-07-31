import { UserRole } from '@sales-ai/database';

export const approvalReadRoles = [UserRole.system_admin, UserRole.admin, UserRole.manager] as const;
export const approvalEditRoles = [UserRole.system_admin, UserRole.admin] as const;
export const approvalDecisionRoles = [UserRole.system_admin] as const;

export type ApprovalDecision = 'approve' | 'reject' | 'suspend' | 'resume';

export const approvalDecisionStatus = {
  approve: 'approved',
  reject: 'rejected',
  suspend: 'suspended',
  resume: 'approved',
} as const;

export function canTransitionApproval(current: string, decision: ApprovalDecision) {
  if (decision === 'approve' || decision === 'reject') return current === 'reviewing';
  if (decision === 'suspend') return current === 'approved';
  return current === 'suspended';
}

export function resolveApprovalOrganization(
  auth: { role: UserRole; organizationId: string },
  requestedOrganizationId?: string,
) {
  return auth.role === UserRole.system_admin && requestedOrganizationId
    ? requestedOrganizationId
    : auth.organizationId;
}
