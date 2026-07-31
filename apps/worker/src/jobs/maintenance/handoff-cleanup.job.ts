import type { PrismaClient } from '@sales-ai/database';
import { cleanupExpiredHandoffs } from '../../handoff-cleanup.js';

export function runHandoffCleanupJob(prisma: PrismaClient) {
  return cleanupExpiredHandoffs(prisma);
}
