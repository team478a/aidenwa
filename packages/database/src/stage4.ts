import type { PrismaClient } from '@prisma/client';
import { inCallableWindow } from '@sales-ai/shared';

export { inCallableWindow } from '@sales-ai/shared';

export type ProductionGateInput = {
  organizationId: string;
  campaignId: string;
  companyId: string;
  phoneNumberId: string;
  provider: string;
  region: string;
  now?: Date;
};
export type ProductionGateResult = { allowed: boolean; reasonCodes: string[]; approvalId?: string };

export async function evaluateProductionGate(
  prisma: PrismaClient,
  input: ProductionGateInput,
): Promise<ProductionGateResult> {
  const now = input.now ?? new Date();
  const reasons: string[] = [];
  const approval = await prisma.productionCallApproval.findFirst({
    where: { organizationId: input.organizationId, status: 'approved' },
    orderBy: { decidedAt: 'desc' },
  });
  if (!approval) reasons.push('approval_not_approved');
  else {
    if (!approval.expiresAt || approval.expiresAt <= now) reasons.push('approval_expired');
    if (!(approval.targetRegions as string[]).includes(input.region))
      reasons.push('region_not_approved');
    if (
      !inCallableWindow(
        now,
        approval.callableWeekdays as number[],
        approval.callableStartTime,
        approval.callableEndTime,
        'Asia/Tokyo',
      )
    )
      reasons.push('outside_callable_window');
  }
  const campaign = await prisma.campaign.findFirst({
    where: { id: input.campaignId, organizationId: input.organizationId },
    select: { id: true, status: true, approvedAt: true, productVersionId: true },
  });
  const productVersion = campaign
    ? await prisma.productVersion.findFirst({
        where: { id: campaign.productVersionId, organizationId: input.organizationId },
        select: { productId: true },
      })
    : null;
  if (
    !campaign ||
    !campaign.approvedAt ||
    !['ready', 'running', 'paused'].includes(campaign.status)
  )
    reasons.push('campaign_not_approved');
  else if (
    !productVersion ||
    (approval && !(approval.productIds as string[]).includes(productVersion.productId))
  )
    reasons.push('product_not_approved');
  const phone = await prisma.phoneNumber.findFirst({
    where: {
      id: input.phoneNumberId,
      organizationId: input.organizationId,
      companyId: input.companyId,
      isDeleted: false,
    },
  });
  if (!phone || !phone.isValid || !phone.isCallable) reasons.push('phone_not_callable');
  if (phone?.type === 'fax') reasons.push('fax_number');
  if (phone) {
    const optOut = await prisma.optOut.findFirst({
      where: {
        organizationId: input.organizationId,
        status: 'active',
        channel: { in: ['all', 'phone'] },
        OR: [
          { companyId: input.companyId },
          { phoneNumberId: phone.id },
          { normalizedPhoneSnapshot: phone.normalizedNumber },
        ],
      },
    });
    if (optOut) reasons.push('opt_out');
    const allow = await prisma.testCallAllowlist.findFirst({
      where: {
        organizationId: input.organizationId,
        normalizedPhoneNumber: phone.normalizedNumber,
        active: true,
        consentConfirmed: true,
        expiresAt: { gt: now },
      },
    });
    if (!allow) reasons.push('not_in_test_allowlist');
  }
  const provider = await prisma.providerConfiguration.findUnique({
    where: {
      organizationId_provider: { organizationId: input.organizationId, provider: input.provider },
    },
  });
  if (!provider?.allowed) reasons.push('provider_not_allowed');
  if (provider?.productionEnabled) reasons.push('production_provider_must_remain_disabled');
  const stops = await prisma.emergencyStop.findMany({
    where: {
      active: true,
      OR: [
        { scope: 'system' },
        { scope: 'organization', organizationId: input.organizationId },
        { scope: 'campaign', organizationId: input.organizationId, scopeId: input.campaignId },
        ...(productVersion
          ? [
              {
                scope: 'product' as const,
                organizationId: input.organizationId,
                scopeId: productVersion.productId,
              },
            ]
          : []),
        { scope: 'provider', organizationId: input.organizationId, scopeId: input.provider },
      ],
    },
  });
  if (stops.length) reasons.push('emergency_stop_active');
  const policy = await prisma.productionCallPolicy.findUnique({
    where: { organizationId: input.organizationId },
  });
  if (!policy) reasons.push('policy_missing');
  else {
    const hour = truncateUtc(now, 'hour');
    const day = truncateUtc(now, 'day');
    const month = truncateUtc(now, 'month');
    const [hourUsage, dayUsage, dayBudget, monthBudget, companyAttempts] = await Promise.all([
      prisma.callUsageCounter.findUnique({
        where: {
          organizationId_periodType_periodStart: {
            organizationId: input.organizationId,
            periodType: 'hour',
            periodStart: hour,
          },
        },
      }),
      prisma.callUsageCounter.findUnique({
        where: {
          organizationId_periodType_periodStart: {
            organizationId: input.organizationId,
            periodType: 'day',
            periodStart: day,
          },
        },
      }),
      prisma.callBudgetCounter.findUnique({
        where: {
          organizationId_periodType_periodStart: {
            organizationId: input.organizationId,
            periodType: 'day',
            periodStart: day,
          },
        },
      }),
      prisma.callBudgetCounter.findUnique({
        where: {
          organizationId_periodType_periodStart: {
            organizationId: input.organizationId,
            periodType: 'month',
            periodStart: month,
          },
        },
      }),
      prisma.callAttempt.count({
        where: {
          organizationId: input.organizationId,
          job: { target: { companyId: input.companyId } },
        },
      }),
    ]);
    if ((hourUsage?.callCount ?? 0) >= policy.hourlyCallLimit) reasons.push('hourly_call_limit');
    if ((dayUsage?.callCount ?? 0) >= policy.dailyCallLimit) reasons.push('daily_call_limit');
    if ((dayUsage?.activeCalls ?? 0) >= policy.concurrentCallLimit)
      reasons.push('concurrent_call_limit');
    if ((dayUsage?.callCount ?? 0) >= policy.limitedTestCallLimit)
      reasons.push('limited_test_limit');
    if (policy.dailyBudgetMinor > 0 && (dayBudget?.amountMinor ?? 0) >= policy.dailyBudgetMinor)
      reasons.push('daily_budget_limit');
    if (
      policy.monthlyBudgetMinor > 0 &&
      (monthBudget?.amountMinor ?? 0) >= policy.monthlyBudgetMinor
    )
      reasons.push('monthly_budget_limit');
    if (approval?.maxAttemptsPerCompany && companyAttempts >= approval.maxAttemptsPerCompany)
      reasons.push('company_attempt_limit');
    if (
      approval?.minRetryIntervalMinutes &&
      phone?.lastCalledAt &&
      phone.lastCalledAt.getTime() + approval.minRetryIntervalMinutes * 60_000 > now.getTime()
    )
      reasons.push('retry_interval');
  }
  return {
    allowed: reasons.length === 0,
    reasonCodes: [...new Set(reasons)],
    ...(approval ? { approvalId: approval.id } : {}),
  };
}

export function truncateUtc(value: Date, period: 'hour' | 'day' | 'month'): Date {
  const result = new Date(value);
  if (period === 'month') result.setUTCDate(1);
  if (period !== 'hour') result.setUTCHours(0);
  result.setUTCMinutes(0, 0, 0);
  return result;
}
