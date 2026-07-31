import type { PrismaClient } from '@sales-ai/database';

export async function transitionFollowup(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    taskId: string;
    version: number;
    from: string[];
    data: Record<string, unknown>;
  },
) {
  const result = await prisma.humanFollowupTask.updateMany({
    where: {
      id: input.taskId,
      organizationId: input.organizationId,
      version: input.version,
      status: { in: input.from },
    },
    data: { ...input.data, version: { increment: 1 } },
  });
  if (!result.count) throw new Error('FOLLOWUP_VERSION_CONFLICT');
  return prisma.humanFollowupTask.findUniqueOrThrow({ where: { id: input.taskId } });
}
