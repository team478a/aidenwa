import type { PrismaClient } from '@sales-ai/database';
import { normalizeEmail, normalizePhoneNumber } from '@sales-ai/shared/stage2';
import { optOutInputSchema } from '@sales-ai/validation';

type OptOutInput = ReturnType<typeof optOutInputSchema.parse>;

export async function createOptOut(
  prisma: PrismaClient,
  organizationId: string,
  userId: string,
  input: OptOutInput,
  company: { id: string } | null,
  phone: { id: string; normalizedNumber: string } | null,
  contact: { id: string; email: string | null } | null,
) {
  const optOut = await prisma.optOut.create({
    data: {
      organizationId,
      companyId: company?.id,
      phoneNumberId: phone?.id,
      contactId: contact?.id,
      normalizedPhoneSnapshot:
        phone?.normalizedNumber ??
        (input.phone ? normalizePhoneNumber(input.phone).normalizedNumber : null),
      emailSnapshot: contact?.email ?? normalizeEmail(input.email),
      scope: input.scope,
      channel: input.channel,
      reasonCode: input.reasonCode,
      reasonText: input.reasonText,
      evidenceText: input.evidenceText,
      registeredBy: userId,
    },
  });
  if (company)
    await prisma.company.update({ where: { id: company.id }, data: { salesStatus: 'opt_out' } });
  return optOut;
}

export function releaseOptOut(
  prisma: PrismaClient,
  id: string,
  userId: string,
  releaseReason: string,
) {
  return prisma.optOut.update({
    where: { id },
    data: { status: 'released', releasedBy: userId, releasedAt: new Date(), releaseReason },
  });
}
