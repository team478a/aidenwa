import { createHmac } from 'node:crypto';
import { createExternalCallWebhook, type PrismaClient } from '@sales-ai/database';
import { MockVoiceProvider } from '@sales-ai/voice-provider';
import type { WorkerEnv } from '@sales-ai/validation';

export async function processExternalCallRequest(
  prisma: PrismaClient,
  env: WorkerEnv,
  executionId: string,
  organizationId: string,
) {
  const execution = await prisma.externalCallExecution.findFirst({
    where: { id: executionId, organizationId, status: { in: ['scheduled', 'queued'] } },
    include: { integrationClient: true, callProfile: true },
  });
  if (!execution) return;
  if (
    execution.integrationClient.environment !== 'sandbox' ||
    execution.callProfile.environment !== 'sandbox'
  ) {
    await prisma.externalCallExecution.update({
      where: { id: execution.id },
      data: {
        status: 'rejected',
        errorCode: 'EXTERNAL_PROVIDER_DISABLED',
        completedAt: new Date(),
      },
    });
    return;
  }
  const stop = await prisma.emergencyStop.findFirst({
    where: {
      active: true,
      OR: [{ scope: 'system' }, { scope: 'organization', organizationId }],
    },
  });
  if (stop) {
    await prisma.externalCallExecution.update({
      where: { id: execution.id },
      data: {
        status: 'skipped',
        errorCode: 'EMERGENCY_STOP_ACTIVE',
        completedAt: new Date(),
      },
    });
    return;
  }
  const optOuts = await prisma.optOut.findMany({
    where: {
      organizationId,
      status: 'active',
      normalizedPhoneSnapshot: { not: null },
      channel: { in: ['all', 'phone'] },
    },
    select: { normalizedPhoneSnapshot: true },
  });
  const isOptedOut = optOuts.some((optOut) => {
    if (!optOut.normalizedPhoneSnapshot) return false;
    return (
      createHmac('sha256', env.SOURCE_NUMBER_FINGERPRINT_KEY)
        .update(optOut.normalizedPhoneSnapshot)
        .digest('hex') === execution.phoneFingerprint
    );
  });
  if (isOptedOut) {
    await prisma.externalCallExecution.update({
      where: { id: execution.id },
      data: { status: 'skipped', errorCode: 'OPT_OUT', completedAt: new Date() },
    });
    return;
  }
  if (!isWithinCallWindow(new Date(), execution.callProfile)) {
    await prisma.externalCallExecution.update({
      where: { id: execution.id },
      data: { status: 'skipped', errorCode: 'CALL_WINDOW_DENIED', completedAt: new Date() },
    });
    return;
  }
  const provider = new MockVoiceProvider();
  await prisma.$transaction(async (tx) => {
    await tx.externalCallExecution.update({
      where: { id: execution.id },
      data: { status: 'calling', startedAt: new Date() },
    });
    await createExternalCallWebhook(tx, execution, 'call.started', { status: 'calling' });
  });
  const call = await provider.createCall({
    idempotencyKey: execution.idempotencyKey,
    maskedDestination: `****${execution.phoneLast4}`,
    fixture: 'qualified',
  });
  provider.complete(call.providerCallId);
  await prisma.$transaction(async (tx) => {
    const completed = await tx.externalCallExecution.updateMany({
      where: { id: execution.id, status: 'calling' },
      data: { status: 'completed', result: 'qualified', completedAt: new Date() },
    });
    if (completed.count) {
      await createExternalCallWebhook(tx, execution, 'call.completed', {
        status: 'completed',
        result: 'qualified',
      });
      await createExternalCallWebhook(tx, execution, 'call.qualified', {
        status: 'completed',
        result: 'qualified',
        qualification: 'hot',
      });
    }
  });
}

function isWithinCallWindow(
  at: Date,
  profile: {
    timezone: string;
    callableWeekdays: unknown;
    callableStartTime: string;
    callableEndTime: string;
  },
) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: profile.timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  const weekdays: Readonly<Record<string, number>> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const weekday = weekdays[value('weekday') ?? ''];
  const hour = Number(value('hour'));
  const minute = Number(value('minute'));
  if (weekday === undefined || !Number.isFinite(hour) || !Number.isFinite(minute)) return false;
  const localMinute = hour * 60 + minute;
  const weekdaysValue = Array.isArray(profile.callableWeekdays)
    ? profile.callableWeekdays.filter((item): item is number => Number.isInteger(item))
    : [];
  const toMinute = (value: string) => {
    const [hours = Number.NaN, minutes = Number.NaN] = value.split(':').map(Number);
    return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : -1;
  };
  const startMinute = toMinute(profile.callableStartTime);
  const endMinute = toMinute(profile.callableEndTime);
  return weekdaysValue.includes(weekday) && localMinute >= startMinute && localMinute < endMinute;
}
