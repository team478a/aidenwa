import { truncateUtc, type Prisma, type PrismaClient } from '@sales-ai/database';
import { MockVoiceProvider, maskPhone, type MockFixture } from '@sales-ai/voice-provider';

const provider = new MockVoiceProvider();

export async function processMockCall(
  prisma: PrismaClient,
  callJobId: string,
  organizationId: string,
) {
  const job = await prisma.callJob.findFirst({
    where: { id: callJobId, organizationId },
    include: { campaign: true, target: true, attempts: true },
  });
  if (!job || ['completed', 'cancelled', 'skipped'].includes(job.status)) return;
  const product = await prisma.productVersion.findFirst({
    where: { id: job.campaign.productVersionId, organizationId },
    select: { productId: true },
  });
  const emergencyStop = await prisma.emergencyStop.findFirst({
    where: {
      active: true,
      OR: [
        { scope: 'system' },
        { scope: 'organization', organizationId },
        { scope: 'campaign', organizationId, scopeId: job.campaignId },
        ...(product
          ? [{ scope: 'product' as const, organizationId, scopeId: product.productId }]
          : []),
        { scope: 'provider', organizationId, scopeId: job.provider },
      ],
    },
  });
  if (emergencyStop) {
    await prisma.callJob.update({
      where: { id: job.id },
      data: {
        status: 'skipped',
        errorCode: 'emergency_stop_active',
        errorMessage: 'Worker safety recheck blocked dispatch',
      },
    });
    return;
  }
  if (job.campaign.status !== 'running') {
    await prisma.callJob.update({
      where: { id: job.id },
      data: { status: 'skipped', errorCode: 'campaign_not_running' },
    });
    return;
  }
  const scheduleReason = await executionLimitReason(prisma, job);
  if (scheduleReason) {
    await prisma.callJob.update({
      where: { id: job.id },
      data: { status: 'skipped', errorCode: scheduleReason },
    });
    await prisma.campaignTarget.update({
      where: { id: job.target.id },
      data: { status: scheduleReason === 'retry_not_due' ? 'retry_wait' : 'pending' },
    });
    return;
  }
  const phone = job.target.phoneNumberId
    ? await prisma.phoneNumber.findFirst({
        where: { id: job.target.phoneNumberId, organizationId, isDeleted: false },
      })
    : null;
  const blocked = await prisma.optOut.count({
    where: {
      organizationId,
      status: 'active',
      OR: [
        { companyId: job.target.companyId, scope: 'company', channel: 'all' },
        ...(phone
          ? [
              {
                normalizedPhoneSnapshot: phone.normalizedNumber,
                scope: 'phone' as const,
                channel: 'phone' as const,
              },
            ]
          : []),
      ],
    },
  });
  if (!phone || phone.type === 'fax' || !phone.isValid || !phone.isCallable || blocked) {
    const reason = blocked
      ? 'opt_out_before_dispatch'
      : !phone
        ? 'phone_missing'
        : phone.type === 'fax'
          ? 'fax'
          : 'not_callable';
    await prisma.$transaction([
      prisma.callJob.update({
        where: { id: job.id },
        data: { status: 'skipped', errorCode: reason },
      }),
      prisma.campaignTarget.update({
        where: { id: job.target.id },
        data: { status: 'excluded', eligibilityStatus: 'excluded', exclusionReason: reason },
      }),
    ]);
    return;
  }
  const call = await provider.createCall({
    idempotencyKey: job.idempotencyKey,
    maskedDestination: maskPhone(phone.normalizedNumber),
    fixture: job.fixture as MockFixture,
  });
  const attemptNumber = job.attempts.length + 1;
  const attempt = await prisma.callAttempt.upsert({
    where: { callJobId_attemptNumber: { callJobId: job.id, attemptNumber } },
    update: {},
    create: {
      organizationId,
      callJobId: job.id,
      attemptNumber,
      providerAttemptId: call.providerCallId,
      scenarioSnapshot: { versionId: job.campaign.scenarioVersionId },
      agentSnapshot: { versionId: job.campaign.aiAgentVersionId },
      productSnapshot: { versionId: job.campaign.productVersionId },
      knowledgeSnapshot: { knowledgeBaseId: job.campaign.knowledgeBaseId },
    },
  });
  const result = fixtureResult(job.fixture as MockFixture);
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.callJob.update({
      where: { id: job.id },
      data: {
        providerJobId: call.providerCallId,
        status: 'completed',
        startedAt: now,
        completedAt: now,
      },
    });
    await tx.callAttempt.update({
      where: { id: attempt.id },
      data: {
        answeredAt: result.answered ? now : null,
        endedAt: now,
        resultCode: result.code,
        qualification: result.qualification,
        nextActionType: result.nextActionType,
        nextActionAt: result.nextActionAt,
        summary: `Mock result: ${result.code}`,
        structuredResult: { fixture: job.fixture },
      },
    });
    await tx.callEvent.upsert({
      where: { providerEventId: `${call.providerCallId}:completed` },
      update: {},
      create: {
        organizationId,
        callAttemptId: attempt.id,
        sequenceNumber: 1,
        eventType: 'mock.completed',
        providerEventId: `${call.providerCallId}:completed`,
        payload: { resultCode: result.code },
      },
    });
    await tx.campaignTarget.update({
      where: { id: job.target.id },
      data: {
        status: 'completed',
        attemptCount: { increment: 1 },
        lastAttemptAt: now,
        completedAt: now,
      },
    });
    await tx.company.update({
      where: { id: job.target.companyId },
      data: {
        salesStatus: result.salesStatus,
        lastContactedAt: now,
        nextActionType: result.nextActionType,
        nextActionAt: result.nextActionAt,
      },
    });
    await tx.phoneNumber.update({
      where: { id: phone.id },
      data: {
        lastCalledAt: now,
        lastCallResult: result.code,
        totalCallCount: { increment: 1 },
        ...(result.disablePhone ? { isCallable: false } : {}),
      },
    });
    if (result.code === 'opt_out_requested') {
      await tx.optOut.create({
        data: {
          organizationId,
          companyId: job.target.companyId,
          phoneNumberId: phone.id,
          normalizedPhoneSnapshot: phone.normalizedNumber,
          scope: 'phone',
          channel: 'phone',
          reasonCode: 'customer_request',
          reasonText: 'Mock opt-out request',
          registeredBy: job.campaign.createdBy,
        },
      });
      await tx.campaignTarget.updateMany({
        where: {
          campaignId: job.campaignId,
          phoneNumberId: phone.id,
          status: { in: ['pending', 'queued', 'retry_wait'] },
        },
        data: { status: 'excluded', eligibilityStatus: 'excluded', exclusionReason: 'opt_out' },
      });
    }
    await tx.auditLog.create({
      data: {
        organizationId,
        userId: job.campaign.createdBy,
        action: 'mock_call.outcome_applied',
        entityType: 'call_attempt',
        entityId: attempt.id,
        afterData: {
          resultCode: result.code,
          companyId: job.target.companyId,
          phoneNumberId: phone.id,
        },
      },
    });
  });
  await recordMockUsage(prisma, organizationId, now);
}

async function recordMockUsage(prisma: PrismaClient, organizationId: string, now: Date) {
  const policy = await prisma.productionCallPolicy.findUnique({ where: { organizationId } });
  if (!policy) return;
  for (const periodType of ['hour', 'day'] as const) {
    const periodStart = truncateUtc(now, periodType);
    const counter = await prisma.callUsageCounter.upsert({
      where: { organizationId_periodType_periodStart: { organizationId, periodType, periodStart } },
      update: { callCount: { increment: 1 } },
      create: { organizationId, periodType, periodStart, callCount: 1 },
    });
    const limit = periodType === 'hour' ? policy.hourlyCallLimit : policy.dailyCallLimit;
    await recordThreshold(
      prisma,
      organizationId,
      `${periodType}_call`,
      counter.callCount - 1,
      counter.callCount,
      limit,
    );
  }
  for (const periodType of ['day', 'month'] as const) {
    const periodStart = truncateUtc(now, periodType);
    const counter = await prisma.callBudgetCounter.upsert({
      where: { organizationId_periodType_periodStart: { organizationId, periodType, periodStart } },
      update: { amountMinor: { increment: policy.mockCostPerCallMinor } },
      create: {
        organizationId,
        periodType,
        periodStart,
        amountMinor: policy.mockCostPerCallMinor,
        currency: policy.currency,
      },
    });
    const limit = periodType === 'day' ? policy.dailyBudgetMinor : policy.monthlyBudgetMinor;
    await recordThreshold(
      prisma,
      organizationId,
      `${periodType}_budget`,
      counter.amountMinor - policy.mockCostPerCallMinor,
      counter.amountMinor,
      limit,
    );
  }
}

async function recordThreshold(
  prisma: PrismaClient,
  organizationId: string,
  metric: string,
  before: number,
  after: number,
  limit: number,
) {
  if (limit <= 0) return;
  for (const threshold of [80, 90, 100])
    if ((before * 100) / limit < threshold && (after * 100) / limit >= threshold)
      await prisma.auditLog.create({
        data: {
          organizationId,
          action: 'production_limit.threshold_reached',
          entityType: 'production_call_policy',
          afterData: {
            metric,
            thresholdPercent: threshold,
            current: after,
            limit,
            realCallingEnabled: false,
          },
        },
      });
}

async function executionLimitReason(
  prisma: PrismaClient,
  job: Prisma.CallJobGetPayload<{
    include: { campaign: true; target: true; attempts: true };
  }>,
) {
  if (!job) return 'job_missing';
  const now = new Date();
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: job.campaign.timezone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday ?? '');
  const minute = Number(parts.hour) * 60 + Number(parts.minute);
  const [startHour = 0, startMinute = 0] = job.campaign.callableStartTime.split(':').map(Number);
  const [endHour = 0, endMinute = 0] = job.campaign.callableEndTime.split(':').map(Number);
  const start = startHour * 60 + startMinute;
  const end = endHour * 60 + endMinute;
  const inWindow =
    start <= end ? minute >= start && minute <= end : minute >= start || minute <= end;
  const weekdays = job.campaign.callableWeekdays as number[];
  if (!weekdays.includes(weekday) || !inWindow) return 'outside_callable_window';
  if (job.target.attemptCount >= job.campaign.maxAttemptsPerTarget) return 'attempt_limit';
  if (job.target.nextAttemptAt && job.target.nextAttemptAt > now) return 'retry_not_due';
  const startOfDay = new Date(now);
  startOfDay.setUTCHours(0, 0, 0, 0);
  if (
    (await prisma.callJob.count({
      where: { campaignId: job.campaignId, status: 'completed', completedAt: { gte: startOfDay } },
    })) >= job.campaign.dailyCallLimit
  )
    return 'daily_limit';
  if (
    (await prisma.callJob.count({
      where: { campaignId: job.campaignId, status: { in: ['dispatching', 'in_progress'] } },
    })) >= job.campaign.maxConcurrentCalls
  )
    return 'concurrency_limit';
  return null;
}

export async function recoverStuckReservations(prisma: PrismaClient, before: Date) {
  const result = await prisma.campaignTarget.updateMany({
    where: { status: 'reserved', reservedAt: { lt: before } },
    data: { status: 'pending', reservedAt: null },
  });
  return result.count;
}

function fixtureResult(fixture: MockFixture) {
  const next = new Date(Date.now() + 86_400_000);
  if (fixture === 'qualified')
    return {
      code: 'qualified',
      answered: true,
      qualification: 'qualified',
      salesStatus: 'qualified' as const,
      nextActionType: 'follow_up',
      nextActionAt: next,
      disablePhone: false,
    };
  if (fixture === 'opt_out')
    return {
      code: 'opt_out_requested',
      answered: true,
      qualification: null,
      salesStatus: 'opt_out' as const,
      nextActionType: null,
      nextActionAt: null,
      disablePhone: false,
    };
  if (fixture === 'invalid_number' || fixture === 'fax_detected')
    return {
      code: fixture,
      answered: false,
      qualification: null,
      salesStatus: 'excluded' as const,
      nextActionType: null,
      nextActionAt: null,
      disablePhone: true,
    };
  return {
    code: fixture,
    answered: fixture === 'answered',
    qualification: null,
    salesStatus: 'retry' as const,
    nextActionType: 'retry',
    nextActionAt: next,
    disablePhone: false,
  };
}
