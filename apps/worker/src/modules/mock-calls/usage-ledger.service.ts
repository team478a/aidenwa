import { truncateUtc, type PrismaClient } from '@sales-ai/database';

export async function rebuildUsageCounters(prisma: PrismaClient, organizationId: string) {
  const [ledgers, previousCalls, previousBudgets, policy] = await Promise.all([
    prisma.usageLedger.findMany({ where: { organizationId }, orderBy: { occurredAt: 'asc' } }),
    prisma.callUsageCounter.findMany({ where: { organizationId } }),
    prisma.callBudgetCounter.findMany({ where: { organizationId } }),
    prisma.productionCallPolicy.findUnique({ where: { organizationId } }),
  ]);
  const calls = new Map<string, { periodType: string; periodStart: Date; callCount: number }>();
  const budgets = new Map<
    string,
    { periodType: string; periodStart: Date; amountMinor: number; currency: string }
  >();
  for (const ledger of ledgers) {
    for (const periodType of ['hour', 'day'] as const) {
      const periodStart = truncateUtc(ledger.occurredAt, periodType);
      const key = `${periodType}:${periodStart.toISOString()}`;
      const current = calls.get(key);
      calls.set(key, {
        periodType,
        periodStart,
        callCount: (current?.callCount ?? 0) + ledger.callCount,
      });
    }
    for (const periodType of ['day', 'month'] as const) {
      const periodStart = truncateUtc(ledger.occurredAt, periodType);
      const key = `${periodType}:${periodStart.toISOString()}`;
      const current = budgets.get(key);
      if (current && current.currency !== ledger.currency)
        throw new Error('usage_ledger_currency_mismatch');
      budgets.set(key, {
        periodType,
        periodStart,
        amountMinor: (current?.amountMinor ?? 0) + ledger.amountMinor,
        currency: ledger.currency,
      });
    }
  }
  await prisma.$transaction(async (tx) => {
    await tx.callUsageCounter.deleteMany({ where: { organizationId } });
    await tx.callBudgetCounter.deleteMany({ where: { organizationId } });
    if (calls.size)
      await tx.callUsageCounter.createMany({
        data: [...calls.values()].map((item) => ({ organizationId, ...item })),
      });
    if (budgets.size)
      await tx.callBudgetCounter.createMany({
        data: [...budgets.values()].map((item) => ({ organizationId, ...item })),
      });
  });
  if (!policy) return;
  for (const counter of calls.values()) {
    const before =
      previousCalls.find(
        (item) =>
          item.periodType === counter.periodType &&
          item.periodStart.getTime() === counter.periodStart.getTime(),
      )?.callCount ?? 0;
    const limit = counter.periodType === 'hour' ? policy.hourlyCallLimit : policy.dailyCallLimit;
    await recordThreshold(
      prisma,
      organizationId,
      `${counter.periodType}_call`,
      before,
      counter.callCount,
      limit,
    );
  }
  for (const counter of budgets.values()) {
    const before =
      previousBudgets.find(
        (item) =>
          item.periodType === counter.periodType &&
          item.periodStart.getTime() === counter.periodStart.getTime(),
      )?.amountMinor ?? 0;
    const limit =
      counter.periodType === 'day' ? policy.dailyBudgetMinor : policy.monthlyBudgetMinor;
    await recordThreshold(
      prisma,
      organizationId,
      `${counter.periodType}_budget`,
      before,
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
