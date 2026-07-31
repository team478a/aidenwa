import type { PrismaClient } from '@sales-ai/database';
import { reopenSnoozedFollowups } from '../../followup.js';

export function runFollowupReopenJob(prisma: PrismaClient) {
  return reopenSnoozedFollowups(prisma);
}
