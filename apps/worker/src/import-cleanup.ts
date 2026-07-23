import type { PrismaClient } from '@sales-ai/database';

/** Removes expired import payloads, including jobs left queued/processing by an abnormal exit. */
export async function cleanupExpiredImports(prisma: PrismaClient, now = new Date()) {
  return prisma.importJob.deleteMany({ where: { expiresAt: { lt: now } } });
}
