import { UserRole } from '@sales-ai/database';

import type { AuthContext } from '../../types.js';

export const optOutReleaseRoles = [UserRole.admin] as const;

export function optOutListScope(auth: AuthContext) {
  return {
    organizationId: auth.organizationId,
    ...(auth.role === UserRole.sales ? { company: { ownerUserId: auth.userId } } : {}),
  };
}

type OptOutAuditSource = {
  id: string;
  companyId?: string | null;
  phoneNumberId?: string | null;
  contactId?: string | null;
  scope: string;
  channel: string;
  status: string;
  reasonCode: string;
  releaseReason?: string | null;
};

export function optOutAuditData(optOut: OptOutAuditSource) {
  return {
    id: optOut.id,
    companyId: optOut.companyId,
    phoneNumberId: optOut.phoneNumberId,
    contactId: optOut.contactId,
    scope: optOut.scope,
    channel: optOut.channel,
    status: optOut.status,
    reasonCode: optOut.reasonCode,
    releaseReason: optOut.releaseReason,
  };
}
