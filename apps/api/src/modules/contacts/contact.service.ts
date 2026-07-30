import type { PrismaClient } from '@sales-ai/database';
import { normalizeEmail } from '@sales-ai/shared/stage2';
import { contactInputSchema, contactPatchSchema } from '@sales-ai/validation';

type ContactInput = ReturnType<typeof contactInputSchema.parse>;
type ContactPatch = ReturnType<typeof contactPatchSchema.parse>;

function clean<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

export function createContact(
  prisma: PrismaClient,
  organizationId: string,
  companyId: string,
  input: ContactInput,
) {
  return prisma.companyContact.create({
    data: {
      organizationId,
      companyId,
      ...clean(input),
      email: normalizeEmail(input.email),
    },
  });
}

export function updateContact(prisma: PrismaClient, id: string, input: ContactPatch) {
  return prisma.companyContact.update({
    where: { id },
    data: {
      ...clean(input),
      email: input.email === undefined ? undefined : normalizeEmail(input.email),
    },
  });
}

export function deleteContact(prisma: PrismaClient, id: string) {
  return prisma.companyContact.update({ where: { id }, data: { isDeleted: true } });
}
