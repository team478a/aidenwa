import type { PrismaClient } from '@sales-ai/database';
import { cleanupExpiredImports } from '../../import-cleanup.js';

export function runImportCleanupJob(prisma: PrismaClient) {
  return cleanupExpiredImports(prisma);
}
