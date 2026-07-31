import type { PrismaClient } from '@sales-ai/database';
import type { ProductionPolicyInput } from '@sales-ai/validation';

import { saveProductionPolicy } from './production-policy.repository.js';

export function updateProductionPolicy(
  prisma: PrismaClient,
  organizationId: string,
  userId: string,
  input: ProductionPolicyInput,
) {
  return saveProductionPolicy(prisma, organizationId, userId, input);
}
