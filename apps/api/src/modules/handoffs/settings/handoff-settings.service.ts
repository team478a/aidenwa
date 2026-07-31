import type { PrismaClient } from '@sales-ai/database';

export function listHandoffSettings(prisma: PrismaClient, organizationId: string) {
  return prisma.handoffSetting.findMany({
    where: { organizationId },
    orderBy: { version: 'desc' },
  });
}

export async function createHandoffSetting(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    userId: string;
    allowedCodes: Record<string, string[]>;
    scoreRules: Record<string, number>;
  },
) {
  const latest = await prisma.handoffSetting.findFirst({
    where: { organizationId: input.organizationId },
    orderBy: { version: 'desc' },
  });
  return prisma.handoffSetting.create({
    data: {
      organizationId: input.organizationId,
      version: (latest?.version ?? 0) + 1,
      createdBy: input.userId,
      allowedCodes: input.allowedCodes,
      scoreRules: input.scoreRules,
    },
  });
}

export async function transitionHandoffSetting(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    settingId: string;
    userId: string;
    action: 'validate' | 'publish';
  },
) {
  const setting = await prisma.handoffSetting.findFirst({
    where: { id: input.settingId, organizationId: input.organizationId },
  });
  if (!setting) return null;
  return prisma.$transaction(async (tx) => {
    if (input.action === 'publish')
      await tx.handoffSetting.updateMany({
        where: { organizationId: input.organizationId, status: 'published' },
        data: { status: 'archived' },
      });
    return tx.handoffSetting.update({
      where: { id: input.settingId },
      data:
        input.action === 'publish'
          ? { status: 'published', publishedBy: input.userId, publishedAt: new Date() }
          : { status: 'validated' },
    });
  });
}
