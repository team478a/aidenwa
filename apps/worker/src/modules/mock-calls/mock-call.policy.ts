import type { Prisma, PrismaClient } from '@sales-ai/database';
import { inCallableWindow } from '@sales-ai/shared';
import type { MockFixture } from '@sales-ai/voice-provider';
import type { MockCallStopReason } from '../../mock-call-state.js';

type MockCallJob = Prisma.CallJobGetPayload<{
  include: { campaign: true; target: true; attempts: true };
}>;

export async function executionLimitReason(
  prisma: PrismaClient,
  job: MockCallJob,
): Promise<MockCallStopReason | null> {
  const now = new Date();
  const weekdays = job.campaign.callableWeekdays as number[];
  if (
    !inCallableWindow(
      now,
      weekdays,
      job.campaign.callableStartTime,
      job.campaign.callableEndTime,
      job.campaign.timezone,
    )
  )
    return 'outside_callable_window';
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

export function fixtureResult(fixture: MockFixture) {
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
