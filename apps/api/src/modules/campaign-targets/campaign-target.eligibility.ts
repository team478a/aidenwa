import type { PrismaClient } from '@sales-ai/database';

import { checkOptOut } from '../../stage2-services.js';

export async function targetEligibility(
  prisma: PrismaClient,
  organizationId: string,
  companyId: string,
  phoneNumberId?: string | null,
) {
  const company = await prisma.company.findFirst({
    where: { id: companyId, organizationId, isDeleted: false },
  });
  if (!company) return { eligible: false, reason: 'company_missing' };
  if (!phoneNumberId) return { eligible: false, reason: 'phone_missing' };
  const phone = await prisma.phoneNumber.findFirst({
    where: { id: phoneNumberId, companyId, organizationId, isDeleted: false },
  });
  if (!phone) return { eligible: false, reason: 'phone_missing' };
  if (phone.type === 'fax') return { eligible: false, reason: 'fax' };
  if (!phone.isValid) return { eligible: false, reason: 'invalid_phone' };
  if (!phone.isCallable) return { eligible: false, reason: 'not_callable' };
  const blocked = await checkOptOut(prisma, organizationId, {
    companyId,
    phoneNumberId,
    phone: phone.normalizedNumber,
    channel: 'phone',
  });
  if (blocked.blocked) return { eligible: false, reason: `opt_out:${blocked.matchedScope}` };
  return { eligible: true, reason: null, phone };
}
