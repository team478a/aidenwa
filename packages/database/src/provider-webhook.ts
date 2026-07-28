import { Prisma, type PrismaClient, type RealCallState } from '@prisma/client';

const TERMINAL: RealCallState[] = ['completed', 'busy', 'no_answer', 'failed', 'canceled'];
const MAX_ATTEMPTS = 3;

type WebhookData = {
  executionId: string;
  callSid: string;
  callFingerprint: string;
  state: RealCallState;
  priceMinor?: number;
  currency?: string;
};

function parseData(value: Prisma.JsonValue): WebhookData {
  if (!value || Array.isArray(value) || typeof value !== 'object')
    throw new Error('invalid_webhook_normalized_data');
  const executionId = value.executionId;
  const callSid = value.callSid;
  const callFingerprint = value.callFingerprint;
  const state = value.state;
  const priceMinor = value.priceMinor;
  const currency = value.currency;
  if (
    typeof executionId !== 'string' ||
    typeof callSid !== 'string' ||
    typeof callFingerprint !== 'string' ||
    typeof state !== 'string' ||
    ![
      'reserved',
      'provider_unknown',
      'queued',
      'initiated',
      'ringing',
      'in_progress',
      ...TERMINAL,
    ].includes(state) ||
    (priceMinor !== undefined &&
      (typeof priceMinor !== 'number' || !Number.isInteger(priceMinor) || priceMinor < 0)) ||
    (currency !== undefined && (typeof currency !== 'string' || !/^[A-Z]{3}$/u.test(currency)))
  )
    throw new Error('invalid_webhook_normalized_data');
  return {
    executionId,
    callSid,
    callFingerprint,
    state: state as RealCallState,
    ...(typeof priceMinor === 'number' ? { priceMinor } : {}),
    ...(typeof currency === 'string' ? { currency } : {}),
  };
}

function shouldAdvance(current: RealCallState, next: RealCallState) {
  if (TERMINAL.includes(current)) return false;
  if (TERMINAL.includes(next)) return true;
  const rank: Partial<Record<RealCallState, number>> = {
    reserved: 0,
    provider_unknown: 0,
    queued: 1,
    initiated: 2,
    ringing: 3,
    in_progress: 4,
  };
  return (rank[next] ?? 0) >= (rank[current] ?? 0);
}

function thresholds(before: number, after: number, limit: number) {
  if (limit <= 0) return ['100_percent'];
  return [
    ...(before < limit * 0.8 && after >= limit * 0.8 ? ['80_percent'] : []),
    ...(before < limit * 0.9 && after >= limit * 0.9 ? ['90_percent'] : []),
    ...(before < limit && after >= limit ? ['100_percent'] : []),
  ];
}

export type ProviderWebhookProcessingOptions = {
  beforeCommit?: () => void | Promise<void>;
  maxAttempts?: number;
};

export async function processStoredProviderWebhook(
  prisma: PrismaClient,
  eventId: string,
  options: ProviderWebhookProcessingOptions = {},
) {
  const initial = await prisma.providerWebhookEvent.findUnique({ where: { id: eventId } });
  if (!initial || ['processed', 'failed'].includes(initial.processingStatus)) return;
  try {
    await prisma.$transaction(async (tx) => {
      const event = await tx.providerWebhookEvent.findUniqueOrThrow({ where: { id: eventId } });
      if (['processed', 'failed'].includes(event.processingStatus)) return;
      if (event.provider !== 'twilio') {
        await tx.providerWebhookEvent.update({
          where: { id: event.id },
          data: { processingStatus: 'processed', failureCode: null, processedAt: new Date() },
        });
        return;
      }
      const data = parseData(event.normalizedData);
      const execution = await tx.realCallExecution.findFirstOrThrow({
        where: { id: data.executionId, organizationId: event.organizationId },
      });
      const sequence = event.sequenceNumber ?? 0;
      if (sequence > execution.lastWebhookSequence) {
        const advance = shouldAdvance(execution.state, data.state);
        const terminal = TERMINAL.includes(data.state);
        const nextCost = terminal ? data.priceMinor : undefined;
        await tx.realCallExecution.update({
          where: { id: execution.id },
          data: {
            lastWebhookSequence: sequence,
            ...(!execution.providerCallId
              ? {
                  providerCallId: data.callSid,
                  providerCallIdFingerprint: data.callFingerprint,
                }
              : {}),
            ...(advance
              ? {
                  state: data.state,
                  ...(data.state === 'in_progress' ? { answeredAt: new Date() } : {}),
                  ...(terminal ? { endedAt: new Date() } : {}),
                  ...(nextCost !== undefined
                    ? {
                        finalCostMinor: nextCost,
                        reservedCostMinor: nextCost,
                        ...(data.currency ? { currency: data.currency } : {}),
                      }
                    : {}),
                }
              : {}),
          },
        });
        if (advance && nextCost !== undefined) {
          const authorization = await tx.productionTestAuthorization.findUnique({
            where: { id: execution.authorizationId },
          });
          if (authorization) {
            const total = await tx.realCallExecution.aggregate({
              where: { authorizationId: authorization.id },
              _sum: { reservedCostMinor: true },
            });
            const after = total._sum.reservedCostMinor ?? 0;
            const before = after - nextCost + execution.reservedCostMinor;
            const crossed = thresholds(before, after, authorization.budgetLimitMinor);
            for (const threshold of crossed)
              await tx.auditLog.create({
                data: {
                  organizationId: execution.organizationId,
                  action: `twilio_budget.${threshold}`,
                  entityType: 'production_test_authorization',
                  entityId: authorization.id,
                  afterData: {
                    threshold,
                    amountMinor: after,
                    currency: authorization.currency,
                  },
                },
              });
            if (crossed.includes('100_percent')) {
              await tx.productionTestAuthorization.update({
                where: { id: authorization.id },
                data: { status: 'suspended', decisionReason: 'budget_100_percent' },
              });
              await tx.providerConfiguration.updateMany({
                where: { organizationId: execution.organizationId, provider: 'twilio' },
                data: { productionEnabled: false },
              });
            }
          }
        }
      }
      await options.beforeCommit?.();
      await tx.providerWebhookEvent.update({
        where: { id: event.id },
        data: {
          processingStatus: 'processed',
          processingAttempts: { increment: 1 },
          lastAttemptAt: new Date(),
          failureCode: null,
          processedAt: new Date(),
        },
      });
    });
  } catch (cause) {
    const errorCode = cause instanceof Error ? cause.message.slice(0, 100) : 'unknown_error';
    const maxAttempts = options.maxAttempts ?? MAX_ATTEMPTS;
    const updated = await prisma.providerWebhookEvent.update({
      where: { id: eventId },
      data: {
        processingAttempts: { increment: 1 },
        lastAttemptAt: new Date(),
        processingStatus: initial.processingAttempts + 1 >= maxAttempts ? 'failed' : 'retrying',
        failureCode: errorCode,
      },
    });
    if (updated.processingStatus === 'failed')
      await prisma.productionIncident.upsert({
        where: { dedupeKey: `provider-webhook:${eventId}` },
        update: {},
        create: {
          organizationId: updated.organizationId,
          category: 'provider_webhook_retry_exhausted',
          entityType: 'provider_webhook_event',
          entityId: updated.id,
          dedupeKey: `provider-webhook:${eventId}`,
          summary: 'Provider Webhookの再試行上限に達しました',
          sanitizedDetails: {
            provider: updated.provider,
            eventType: updated.eventType,
            failureCode: errorCode,
          },
          dueAt: new Date(Date.now() + 3_600_000),
        },
      });
    throw cause;
  }
}
