import type { PrismaClient } from '@sales-ai/database';
import { MockVoiceProvider, maskPhone, type MockFixture } from '@sales-ai/voice-provider';
import { executionLimitReason, fixtureResult } from './mock-call.policy.js';
import { applyMockCallStop } from './mock-call.repository.js';
import { rebuildUsageCounters } from './usage-ledger.service.js';

const defaultProvider = new MockVoiceProvider();
export type MockProvider = Pick<MockVoiceProvider, 'createCall'>;

export async function processMockCall(
  prisma: PrismaClient,
  callJobId: string,
  organizationId: string,
  dependencies: { provider?: MockProvider } = {},
) {
  const job = await prisma.callJob.findFirst({
    where: { id: callJobId, organizationId },
    include: { campaign: true, target: true, attempts: true },
  });
  if (!job) return;
  if (job.status === 'completed') {
    await rebuildUsageCounters(prisma, organizationId);
    return;
  }
  if (['cancelled', 'skipped'].includes(job.status)) return;
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
    await applyMockCallStop(prisma, job.id, job.target.id, 'emergency_stop_active');
    return;
  }
  if (job.campaign.status !== 'running') {
    await applyMockCallStop(prisma, job.id, job.target.id, 'campaign_not_running');
    return;
  }
  const scheduleReason = await executionLimitReason(prisma, job);
  if (scheduleReason) {
    await applyMockCallStop(prisma, job.id, job.target.id, scheduleReason);
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
    await applyMockCallStop(prisma, job.id, job.target.id, reason);
    return;
  }
  let call: Awaited<ReturnType<MockProvider['createCall']>>;
  try {
    call = await (dependencies.provider ?? defaultProvider).createCall({
      idempotencyKey: job.idempotencyKey,
      maskedDestination: maskPhone(phone.normalizedNumber),
      fixture: job.fixture as MockFixture,
    });
  } catch {
    await applyMockCallStop(prisma, job.id, job.target.id, 'provider_temporary_failure');
    return;
  }
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
  const policy = await prisma.productionCallPolicy.findUnique({ where: { organizationId } });
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
    await tx.usageLedger.upsert({
      where: {
        executionType_executionId: { executionType: 'mock_call', executionId: job.id },
      },
      update: {},
      create: {
        organizationId,
        executionType: 'mock_call',
        executionId: job.id,
        occurredAt: now,
        callCount: 1,
        amountMinor: policy?.mockCostPerCallMinor ?? 0,
        currency: policy?.currency ?? 'JPY',
        metadata: { provider: 'mock' },
      },
    });
  });
  await rebuildUsageCounters(prisma, organizationId);
}
