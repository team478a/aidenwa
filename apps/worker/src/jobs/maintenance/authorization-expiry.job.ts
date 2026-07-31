import type { PrismaClient } from '@sales-ai/database';
import { expireTwilioAuthorizations } from '../production-calls/rollback.job.js';

export function runAuthorizationExpiryJob(prisma: PrismaClient) {
  return expireTwilioAuthorizations(prisma);
}
