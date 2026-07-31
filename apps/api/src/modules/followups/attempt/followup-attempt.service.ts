import type { PrismaClient } from '@sales-ai/database';
import { transitionFollowup } from '../workflow/followup-state.service.js';

export async function recordFollowupAttempt(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    taskId: string;
    version: number;
    idempotencyKey: string;
    result: string;
  },
) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.followupAttempt.findUnique({
      where: {
        organizationId_idempotencyKey: {
          organizationId: input.organizationId,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
    if (existing)
      return {
        task: await tx.humanFollowupTask.findUniqueOrThrow({ where: { id: input.taskId } }),
        duplicate: true,
      };
    await tx.followupAttempt.create({
      data: {
        organizationId: input.organizationId,
        taskId: input.taskId,
        idempotencyKey: input.idempotencyKey,
        resultCode: input.result,
      },
    });
    const task = await transitionFollowup(tx as PrismaClient, {
      organizationId: input.organizationId,
      taskId: input.taskId,
      version: input.version,
      from: ['assigned', 'in_progress', 'contacted'],
      data: {
        status: input.result === 'connected' ? 'contacted' : 'in_progress',
        attemptCount: { increment: 1 },
        firstAttemptedAt: new Date(),
        ...(input.result === 'connected' ? { firstConnectedAt: new Date() } : {}),
      },
    });
    return { task, duplicate: false };
  });
}
