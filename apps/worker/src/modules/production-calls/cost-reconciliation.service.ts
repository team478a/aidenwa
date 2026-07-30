import type { PrismaClient } from '@sales-ai/database';
import type { WorkerEnv } from '@sales-ai/validation';
import type { ProductionVoiceProvider } from '@sales-ai/voice-provider';
import { productionProviderFromEnv } from './provider.js';

export async function reconcileTwilioCosts(
  prisma: PrismaClient,
  env: WorkerEnv,
  injectedProvider?: ProductionVoiceProvider,
  now = new Date(),
  organizationId?: string,
) {
  const rows = await prisma.realCallExecution.findMany({
    where: {
      ...(organizationId ? { organizationId } : {}),
      state: { in: ['completed', 'busy', 'no_answer', 'failed', 'canceled'] },
      providerCallId: { not: null },
      finalCostMinor: null,
      costSettlementStatus: { in: ['pending', 'retry'] },
      OR: [{ costSettlementNextAt: null }, { costSettlementNextAt: { lte: now } }],
      costSettlementAttempts: { lt: 3 },
    },
    take: 100,
  });
  if (!rows.length) return 0;
  const provider = injectedProvider ?? productionProviderFromEnv(env);
  for (const row of rows)
    try {
      const status = await provider.getProductionCallStatus(row.providerCallId!);
      if (status.priceMinor === undefined) {
        await prisma.realCallExecution.update({
          where: { id: row.id },
          data: {
            costSettlementStatus: 'retry',
            costSettlementAttempts: { increment: 1 },
            costSettlementNextAt: new Date(now.getTime() + 3_600_000),
          },
        });
        continue;
      }
      const currency = status.currency ?? row.currency;
      await prisma.$transaction([
        prisma.realCallExecution.update({
          where: { id: row.id },
          data: {
            finalCostMinor: status.priceMinor,
            reservedCostMinor: status.priceMinor,
            currency,
            costSettlementStatus: currency === row.currency ? 'settled' : 'failed',
            costSettlementAttempts: { increment: 1 },
            costSettlementNextAt: null,
          },
        }),
        ...(currency !== row.currency
          ? [
              prisma.productionIncident.create({
                data: {
                  organizationId: row.organizationId,
                  category: 'cost_currency_mismatch',
                  entityType: 'real_call_execution',
                  entityId: row.id,
                  summary: 'Twilio確定料金の通貨が承認通貨と一致しません',
                  sanitizedDetails: { expectedCurrency: row.currency, actualCurrency: currency },
                },
              }),
            ]
          : []),
      ]);
    } catch {
      const attempts = row.costSettlementAttempts + 1;
      await prisma.$transaction([
        prisma.realCallExecution.update({
          where: { id: row.id },
          data: {
            costSettlementStatus: attempts >= 3 ? 'failed' : 'retry',
            costSettlementAttempts: attempts,
            costSettlementNextAt: attempts >= 3 ? null : new Date(now.getTime() + 3_600_000),
          },
        }),
        ...(attempts >= 3
          ? [
              prisma.productionIncident.create({
                data: {
                  organizationId: row.organizationId,
                  category: 'cost_settlement_failed',
                  entityType: 'real_call_execution',
                  entityId: row.id,
                  summary: 'Twilio確定料金を3回取得できませんでした',
                  sanitizedDetails: { attempts },
                },
              }),
            ]
          : []),
      ]);
    }
  return rows.length;
}
