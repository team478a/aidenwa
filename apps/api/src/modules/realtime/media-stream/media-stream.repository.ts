import type { PrismaClient } from '@sales-ai/database';

export async function loadMediaGateContext(prisma: PrismaClient, executionId: string) {
  const execution = await prisma.realCallExecution.findUnique({ where: { id: executionId } });
  if (!execution || !['initiated', 'ringing', 'in_progress'].includes(execution.state)) return;
  const allowlist = await prisma.testCallAllowlist.findUnique({
    where: { id: execution.allowlistId },
  });
  if (!allowlist) return;
  return {
    execution,
    gateInput: {
      organizationId: execution.organizationId,
      campaignId: execution.campaignId,
      companyId: execution.companyId,
      phoneNumberId: execution.phoneNumberId,
      provider: 'twilio',
      region: allowlist.region,
    },
  };
}

export async function finishMediaSession(
  prisma: PrismaClient,
  id: string,
  failureCode: string,
  now = new Date(),
) {
  const session = await prisma.realtimeCallSession.findUnique({
    where: { id },
    select: { startedAt: true },
  });
  const completed = ['normal_completion', 'caller_hangup', 'max_duration', 'idle_timeout'].includes(
    failureCode,
  );
  return prisma.realtimeCallSession.updateMany({
    where: { id, status: { notIn: ['completed', 'failed', 'provider_unknown'] } },
    data: {
      status: completed
        ? 'completed'
        : failureCode === 'provider_unknown'
          ? 'provider_unknown'
          : 'failed',
      failureCode: completed ? null : failureCode,
      resultCode: completed ? failureCode : undefined,
      endedAt: now,
      durationSeconds: session?.startedAt
        ? Math.max(0, Math.ceil((now.getTime() - session.startedAt.getTime()) / 1000))
        : null,
    },
  });
}
