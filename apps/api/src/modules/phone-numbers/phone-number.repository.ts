import type { PrismaClient } from '@sales-ai/database';

export function listPhoneNumbers(prisma: PrismaClient, organizationId: string, companyId: string) {
  return prisma.phoneNumber.findMany({
    where: { organizationId, companyId, isDeleted: false },
  });
}

export function findPhoneNumber(prisma: PrismaClient, organizationId: string, id: string) {
  return prisma.phoneNumber.findFirst({
    where: { id, organizationId, isDeleted: false },
  });
}

export async function validPhoneContact(
  prisma: PrismaClient,
  organizationId: string,
  companyId: string,
  contactId?: string | null,
) {
  if (!contactId) return true;
  return Boolean(
    await prisma.companyContact.findFirst({
      where: { id: contactId, companyId, organizationId, isDeleted: false },
    }),
  );
}
