import type { Prisma, PrismaClient } from '@sales-ai/database';
import {
  normalizeCompanyName,
  normalizeDomain,
  normalizeEmail,
  normalizePhoneNumber,
} from '@sales-ai/shared/stage2';

export type DuplicateCandidate = { companyId: string; companyName: string; reasons: string[] };
export async function findDuplicateCandidates(
  prisma: PrismaClient,
  organizationId: string,
  input: {
    corporateNumber?: string | null | undefined;
    phone?: string | null | undefined;
    websiteUrl?: string | null | undefined;
    name?: string | null | undefined;
    address?: string | null | undefined;
  },
  excludeId?: string,
): Promise<DuplicateCandidate[]> {
  const phone = input.phone ? normalizePhoneNumber(input.phone).normalizedNumber : null;
  const domain = normalizeDomain(input.websiteUrl);
  const normalizedName = input.name ? normalizeCompanyName(input.name) : null;
  const companies = await prisma.company.findMany({
    where: {
      organizationId,
      isDeleted: false,
      ...(excludeId ? { id: { not: excludeId } } : {}),
      OR: [
        ...(input.corporateNumber ? [{ corporateNumber: input.corporateNumber }] : []),
        ...(phone
          ? [{ phoneNumbers: { some: { normalizedNumber: phone, isDeleted: false } } }]
          : []),
        ...(domain ? [{ websiteUrl: { contains: domain, mode: 'insensitive' as const } }] : []),
        ...(normalizedName ? [{ normalizedName }] : []),
      ],
    },
    include: { phoneNumbers: { where: { isDeleted: false }, select: { normalizedNumber: true } } },
    take: 20,
  });
  return companies
    .map((company) => {
      const reasons: string[] = [];
      if (input.corporateNumber && company.corporateNumber === input.corporateNumber)
        reasons.push('corporate_number_exact');
      if (phone && company.phoneNumbers.some((item) => item.normalizedNumber === phone))
        reasons.push('phone_exact');
      if (domain && normalizeDomain(company.websiteUrl) === domain) reasons.push('domain_exact');
      if (
        normalizedName &&
        company.normalizedName === normalizedName &&
        input.address &&
        company.address === input.address
      )
        reasons.push('name_address_exact');
      else if (normalizedName && company.normalizedName === normalizedName)
        reasons.push('normalized_name');
      return { companyId: company.id, companyName: company.name, reasons };
    })
    .filter((candidate) => candidate.reasons.length > 0);
}

export type OptOutCheckInput = {
  companyId?: string | undefined;
  phoneNumberId?: string | undefined;
  contactId?: string | undefined;
  phone?: string | undefined;
  email?: string | undefined;
  channel: 'phone' | 'email' | 'form' | 'sms';
};
export async function checkOptOut(
  prisma: PrismaClient,
  organizationId: string,
  input: OptOutCheckInput,
) {
  let normalizedPhone = input.phone
    ? normalizePhoneNumber(input.phone).normalizedNumber
    : undefined;
  let email = normalizeEmail(input.email) ?? undefined;
  if (input.phoneNumberId) {
    const phone = await prisma.phoneNumber.findFirst({
      where: { id: input.phoneNumberId, organizationId },
    });
    normalizedPhone ??= phone?.normalizedNumber;
  }
  if (input.contactId) {
    const contact = await prisma.companyContact.findFirst({
      where: { id: input.contactId, organizationId },
    });
    email ??= contact?.email ?? undefined;
  }
  const match = await prisma.optOut.findFirst({
    where: {
      organizationId,
      status: 'active',
      OR: [
        ...(input.companyId
          ? [{ companyId: input.companyId, scope: 'company' as const, channel: 'all' as const }]
          : []),
        ...(normalizedPhone && input.channel === 'phone'
          ? [
              {
                normalizedPhoneSnapshot: normalizedPhone,
                scope: 'phone' as const,
                channel: 'phone' as const,
              },
            ]
          : []),
        ...(email
          ? [{ emailSnapshot: email, channel: { in: ['all' as const, input.channel] } }]
          : []),
        ...(input.companyId
          ? [{ companyId: input.companyId, scope: 'channel' as const, channel: input.channel }]
          : []),
        ...(input.contactId
          ? [
              {
                contactId: input.contactId,
                scope: 'contact' as const,
                channel: { in: ['all' as const, input.channel] },
              },
            ]
          : []),
      ],
    },
    orderBy: { registeredAt: 'desc' },
  });
  return match
    ? {
        blocked: true,
        matchedScope: match.scope,
        matchedChannel: match.channel,
        reasonCode: match.reasonCode,
        optOutId: match.id,
      }
    : {
        blocked: false,
        matchedScope: null,
        matchedChannel: null,
        reasonCode: null,
        optOutId: null,
      };
}

export function companyData(input: Record<string, unknown>): Prisma.CompanyUncheckedCreateInput {
  const name = String(input.name);
  return {
    ...(input as Omit<Prisma.CompanyUncheckedCreateInput, 'normalizedName'>),
    name,
    normalizedName: normalizeCompanyName(name),
  };
}
