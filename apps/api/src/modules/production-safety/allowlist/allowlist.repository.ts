import type { PrismaClient } from '@sales-ai/database';
import type { TestAllowlistInput } from '@sales-ai/validation';

export function listAllowlist(prisma: PrismaClient, organizationId: string) {
  return prisma.testCallAllowlist.findMany({
    where: { organizationId },
    orderBy: { createdAt: 'desc' },
  });
}

export function saveAllowlist(
  prisma: PrismaClient,
  organizationId: string,
  userId: string,
  normalizedPhoneNumber: string,
  input: TestAllowlistInput,
) {
  const values = {
    region: input.region,
    ownerName: input.ownerName,
    purpose: input.purpose,
    consentConfirmed: true,
    expiresAt: input.expiresAt,
    active: true,
    notes: input.notes,
  };
  return prisma.testCallAllowlist.upsert({
    where: {
      organizationId_normalizedPhoneNumber: { organizationId, normalizedPhoneNumber },
    },
    update: values,
    create: {
      ...values,
      organizationId,
      normalizedPhoneNumber,
      phoneLastFour: normalizedPhoneNumber.slice(-4),
      registeredBy: userId,
    },
  });
}

export function findAllowlistEntry(prisma: PrismaClient, organizationId: string, id: string) {
  return prisma.testCallAllowlist.findFirst({ where: { id, organizationId } });
}

export function disableAllowlistEntry(prisma: PrismaClient, id: string) {
  return prisma.testCallAllowlist.update({ where: { id }, data: { active: false } });
}
