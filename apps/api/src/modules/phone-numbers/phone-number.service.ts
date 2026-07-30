import type { PrismaClient } from '@sales-ai/database';
import { normalizePhoneNumber } from '@sales-ai/shared/stage2';
import { phoneInputSchema, phonePatchSchema } from '@sales-ai/validation';

import { callableValue } from './phone-number.policy.js';

type PhoneInput = ReturnType<typeof phoneInputSchema.parse>;
type PhonePatch = ReturnType<typeof phonePatchSchema.parse>;

function clean<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

export function createPhoneNumber(
  prisma: PrismaClient,
  organizationId: string,
  companyId: string,
  input: PhoneInput,
) {
  const normalized = normalizePhoneNumber(input.rawNumber);
  const isCallable = callableValue(input.type, input.isCallable, normalized.isValid);
  return prisma.$transaction(async (tx) => {
    if (input.isPrimary)
      await tx.phoneNumber.updateMany({
        where: { organizationId, companyId, isDeleted: false },
        data: { isPrimary: false },
      });
    return tx.phoneNumber.create({
      data: {
        organizationId,
        companyId,
        ...clean(input),
        ...normalized,
        isCallable,
      },
    });
  });
}

export function updatePhoneNumber(
  prisma: PrismaClient,
  before: {
    id: string;
    organizationId: string;
    companyId: string;
    type: string;
  },
  input: PhonePatch,
) {
  const normalized = input.rawNumber ? normalizePhoneNumber(input.rawNumber) : {};
  const type = input.type ?? before.type;
  const isCallable = type === 'fax' ? false : input.isCallable;
  return prisma.$transaction(async (tx) => {
    if (input.isPrimary)
      await tx.phoneNumber.updateMany({
        where: {
          organizationId: before.organizationId,
          companyId: before.companyId,
          isDeleted: false,
        },
        data: { isPrimary: false },
      });
    return tx.phoneNumber.update({
      where: { id: before.id },
      data: {
        ...clean(input),
        ...normalized,
        ...(isCallable !== undefined ? { isCallable } : {}),
      },
    });
  });
}

export function deletePhoneNumber(prisma: PrismaClient, id: string) {
  return prisma.phoneNumber.update({
    where: { id },
    data: { isDeleted: true, isPrimary: false },
  });
}
