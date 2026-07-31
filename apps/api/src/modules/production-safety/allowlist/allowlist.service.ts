import type { PrismaClient } from '@sales-ai/database';
import { normalizePhoneNumber } from '@sales-ai/shared/stage2';
import type { TestAllowlistInput } from '@sales-ai/validation';
import { saveAllowlist } from './allowlist.repository.js';

export async function registerAllowlistEntry(
  prisma: PrismaClient,
  organizationId: string,
  userId: string,
  input: TestAllowlistInput,
) {
  const normalized = normalizePhoneNumber(input.phoneNumber);
  if (!normalized.isValid) return null;
  return saveAllowlist(prisma, organizationId, userId, normalized.normalizedNumber, input);
}
