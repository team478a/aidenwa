import { createHmac } from 'node:crypto';
import type { PrismaClient } from '@sales-ai/database';
import { FakeZoomPhoneProvider, type FakeZoomFixture } from '@sales-ai/human-calling-provider';
import type { ApiEnv } from '@sales-ai/validation';

export async function runFakeZoomMatch(
  prisma: PrismaClient,
  env: ApiEnv,
  input: { organizationId: string; taskId: string; fixture: FakeZoomFixture },
) {
  const task = await prisma.humanFollowupTask.findFirst({
    where: { id: input.taskId, organizationId: input.organizationId },
  });
  if (!task) throw new Error('FOLLOWUP_NOT_FOUND');
  const provider = new FakeZoomPhoneProvider(input.fixture);
  const calls = (
    await provider.listCallLogs({
      from: new Date(Date.now() - env.ZOOM_PHONE_SYNC_LOOKBACK_MINUTES * 60_000),
      to: new Date(),
    })
  ).calls;
  const outbound = calls.filter((call) => call.direction === 'outbound');
  if (outbound.length !== 1) {
    await prisma.followupNotification.upsert({
      where: { dedupeKey: `zoom-ambiguous:${task.id}:${task.version}` },
      create: {
        organizationId: input.organizationId,
        taskId: task.id,
        type: 'zoom_match_ambiguous',
        dedupeKey: `zoom-ambiguous:${task.id}:${task.version}`,
      },
      update: {},
    });
    return { status: 'ambiguous', matched: false };
  }
  const call = outbound[0]!;
  const fingerprint = hmac(
    env.ZOOM_PHONE_FINGERPRINT_SECRET ?? 'stage4c-fake-fingerprint-secret-32chars',
    call.callFingerprint,
  );
  await prisma.humanFollowupTask.update({
    where: { id: task.id },
    data: {
      zoomCallFingerprint: fingerprint,
      firstAttemptedAt: task.firstAttemptedAt ?? call.startedAt,
      firstConnectedAt:
        call.result === 'connected'
          ? (task.firstConnectedAt ?? call.startedAt)
          : task.firstConnectedAt,
      attemptCount: { increment: 1 },
      status: call.result === 'connected' ? 'contacted' : 'in_progress',
      version: { increment: 1 },
    },
  });
  return { status: call.result, matched: true };
}

function hmac(secret: string, value: string) {
  return createHmac('sha256', secret).update(value).digest('hex');
}
