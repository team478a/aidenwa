import type { PrismaClient } from '@sales-ai/database';

import { enqueueOutbox } from '../../outbox.js';
import { targetEligibility } from '../campaign-targets/campaign-target.eligibility.js';
import { cancellableCallJobStatuses } from './call-job.policy.js';

export async function queueMockCall(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    campaignId: string;
    target: {
      id: string;
      companyId: string;
      phoneNumberId: string | null;
      attemptCount: number;
    };
    fixture: string;
  },
) {
  const eligibility = await targetEligibility(
    prisma,
    input.organizationId,
    input.target.companyId,
    input.target.phoneNumberId ?? undefined,
  );
  if (!eligibility.eligible) {
    await prisma.campaignTarget.update({
      where: { id: input.target.id },
      data: {
        status: 'excluded',
        eligibilityStatus: 'excluded',
        exclusionReason: eligibility.reason,
      },
    });
    return { job: null, exclusionReason: eligibility.reason };
  }

  const idempotencyKey = `${input.campaignId}:${input.target.id}:${input.target.attemptCount + 1}`;
  const job = await prisma.$transaction(async (tx) => {
    const queuedJob = await tx.callJob.upsert({
      where: { idempotencyKey },
      update: {},
      create: {
        organizationId: input.organizationId,
        campaignId: input.campaignId,
        campaignTargetId: input.target.id,
        idempotencyKey,
        fixture: input.fixture,
      },
    });
    await tx.campaignTarget.update({
      where: { id: input.target.id },
      data: { status: 'queued' },
    });
    await enqueueOutbox(tx, {
      organizationId: input.organizationId,
      eventType: 'mock-call',
      aggregateType: 'call_job',
      aggregateId: queuedJob.id,
      payload: { callJobId: queuedJob.id, organizationId: input.organizationId },
    });
    return queuedJob;
  });
  return { job, exclusionReason: null };
}

export async function cancelCallJob(prisma: PrismaClient, organizationId: string, id: string) {
  return prisma.callJob.updateMany({
    where: {
      id,
      organizationId,
      status: { in: [...cancellableCallJobStatuses] },
    },
    data: { status: 'cancelled', cancelledAt: new Date() },
  });
}

export function updateManualOutcome(prisma: PrismaClient, id: string, fixture: string) {
  return prisma.callAttempt.update({
    where: { id },
    data: { resultCode: fixture, summary: `Manual mock outcome: ${fixture}` },
  });
}
