import { createHmac } from 'node:crypto';
import { evaluateProductionGate, type PrismaClient } from '@sales-ai/database';
import type { WorkerEnv } from '@sales-ai/validation';
import { TwilioVoiceProvider, type ProductionVoiceProvider } from '@sales-ai/voice-provider';
export async function processTwilioCall(
  prisma: PrismaClient,
  env: WorkerEnv,
  executionId: string,
  injectedProvider?: ProductionVoiceProvider,
) {
  const execution = await prisma.realCallExecution.findUnique({ where: { id: executionId } });
  if (!execution || execution.state !== 'reserved') return;
  const authorization = await prisma.productionTestAuthorization.findFirst({
    where: {
      id: execution.authorizationId,
      organizationId: execution.organizationId,
      status: 'active',
      startsAt: { lte: new Date() },
      endsAt: { gt: new Date() },
    },
  });
  if (!authorization) {
    await reject(prisma, execution.id, execution.organizationId, 'authorization_inactive');
    return;
  }
  const config = await prisma.providerConfiguration.findUnique({
    where: {
      organizationId_provider: { organizationId: execution.organizationId, provider: 'twilio' },
    },
  });
  const sourceNumber = authorization.sourceNumberApprovalId
    ? await prisma.sourceNumberApproval.findFirst({
        where: {
          id: authorization.sourceNumberApprovalId,
          organizationId: execution.organizationId,
          provider: 'twilio',
          verificationStatus: 'verified',
          active: true,
          expiresAt: { gt: new Date() },
        },
      })
    : null;
  const sourceMatches = Boolean(
    sourceNumber &&
    env.TWILIO_FROM_NUMBER &&
    sourceNumber.numberFingerprint ===
      createHmac('sha256', env.SOURCE_NUMBER_FINGERPRINT_KEY)
        .update(env.TWILIO_FROM_NUMBER)
        .digest('hex'),
  );
  if (
    !ready(env, authorization.releaseCommit, authorization.writtenApprovalCommit) ||
    !config?.allowed ||
    !config.productionEnabled ||
    !sourceMatches
  ) {
    await reject(prisma, execution.id, execution.organizationId, 'production_disabled');
    return;
  }
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const hourStart = new Date(Date.now() - 3_600_000);
  const [sameDestination, activeCalls, todayCalls, hourlyCalls] = await Promise.all([
    prisma.realCallExecution.count({
      where: {
        authorizationId: authorization.id,
        phoneNumberId: execution.phoneNumberId,
        id: { not: execution.id },
      },
    }),
    prisma.realCallExecution.count({
      where: {
        organizationId: execution.organizationId,
        id: { not: execution.id },
        state: { in: ['queued', 'initiated', 'ringing', 'in_progress'] },
      },
    }),
    prisma.realCallExecution.count({
      where: { authorizationId: authorization.id, createdAt: { gte: dayStart } },
    }),
    prisma.realCallExecution.count({
      where: { authorizationId: authorization.id, createdAt: { gte: hourStart } },
    }),
  ]);
  if (sameDestination || activeCalls || todayCalls > 5 || hourlyCalls > 5) {
    await reject(prisma, execution.id, execution.organizationId, 'real_call_limit');
    return;
  }
  const allow = await prisma.testCallAllowlist.findFirst({
    where: {
      id: execution.allowlistId,
      organizationId: execution.organizationId,
      active: true,
      consentConfirmed: true,
      expiresAt: { gt: new Date() },
    },
  });
  const phone = await prisma.phoneNumber.findFirst({
    where: {
      id: execution.phoneNumberId,
      organizationId: execution.organizationId,
      companyId: execution.companyId,
      isDeleted: false,
      isValid: true,
      isCallable: true,
    },
  });
  if (!allow || !phone || allow.normalizedPhoneNumber !== phone.normalizedNumber) {
    await reject(prisma, execution.id, execution.organizationId, 'destination_not_allowed');
    return;
  }
  const gate = await evaluateProductionGate(prisma, {
    organizationId: execution.organizationId,
    campaignId: execution.campaignId,
    companyId: execution.companyId,
    phoneNumberId: execution.phoneNumberId,
    provider: 'twilio',
    region: allow.region,
  });
  if (!gate.allowed) {
    await reject(
      prisma,
      execution.id,
      execution.organizationId,
      `gate:${gate.reasonCodes.join(',')}`,
    );
    return;
  }
  if (
    (await prisma.realCallExecution.count({
      where: { authorizationId: authorization.id, state: { notIn: ['failed', 'canceled'] } },
    })) > authorization.maxCalls
  ) {
    await reject(prisma, execution.id, execution.organizationId, 'call_limit');
    return;
  }
  const spend = await prisma.realCallExecution.aggregate({
    where: { authorizationId: authorization.id },
    _sum: { reservedCostMinor: true },
  });
  if ((spend._sum.reservedCostMinor ?? 0) > authorization.budgetLimitMinor) {
    await reject(prisma, execution.id, execution.organizationId, 'budget_limit');
    return;
  }
  const provider = injectedProvider ?? providerFromEnv(env);
  try {
    const call = await provider.createProductionCall({
      idempotencyKey: execution.idempotencyKey,
      destinationE164: phone.e164Number ?? phone.normalizedNumber,
      fromE164: env.TWILIO_FROM_NUMBER!,
      twimlUrl: `${env.TWILIO_TWIML_BASE_URL}/api/v1/twilio/twiml/${execution.id}`,
      statusCallbackUrl: `${env.TWILIO_STATUS_CALLBACK_BASE_URL}/api/v1/twilio/status/${execution.id}`,
      timeoutSeconds: 20,
      timeLimitSeconds: 120,
      record: false,
    });
    await prisma.realCallExecution.update({
      where: { id: execution.id },
      data: {
        providerCallId: call.providerCallId,
        providerCallIdFingerprint: fingerprint(call.providerCallId),
        state: 'queued',
        startedAt: new Date(),
      },
    });
  } catch {
    await prisma.$transaction([
      prisma.realCallExecution.update({
        where: { id: execution.id },
        data: { state: 'provider_unknown', providerUnknown: true },
      }),
      prisma.productionIncident.create({
        data: {
          organizationId: execution.organizationId,
          category: 'provider_unknown',
          entityType: 'real_call_execution',
          entityId: execution.id,
          summary: 'Twilio Call作成結果が不明です',
          sanitizedDetails: { provider: 'twilio', redialScheduled: false },
          dueAt: new Date(Date.now() + 3_600_000),
        },
      }),
    ]);
  }
}
export async function stopTwilioExecutions(
  prisma: PrismaClient,
  env: WorkerEnv,
  stop: {
    organizationId?: string | null;
    scope?: 'system' | 'organization' | 'campaign' | 'product' | 'provider';
    scopeId?: string | null;
    authorizationId?: string;
  } = {},
  injectedProvider?: ProductionVoiceProvider,
) {
  let campaignIds: string[] | undefined;
  if (stop.scope === 'product' && stop.scopeId) {
    const versions = await prisma.productVersion.findMany({
      where: { productId: stop.scopeId, organizationId: stop.organizationId ?? undefined },
      select: { id: true },
    });
    const campaigns = await prisma.campaign.findMany({
      where: {
        organizationId: stop.organizationId ?? undefined,
        productVersionId: { in: versions.map((version) => version.id) },
      },
      select: { id: true },
    });
    campaignIds = campaigns.map((campaign) => campaign.id);
  }
  const rows = await prisma.realCallExecution.findMany({
    where: {
      ...(stop.organizationId ? { organizationId: stop.organizationId } : {}),
      ...(stop.authorizationId ? { authorizationId: stop.authorizationId } : {}),
      ...(stop.scope === 'campaign' && stop.scopeId ? { campaignId: stop.scopeId } : {}),
      ...(stop.scope === 'product' ? { campaignId: { in: campaignIds ?? [] } } : {}),
      ...(stop.scope === 'provider' ? { provider: stop.scopeId ?? 'twilio' } : {}),
      state: { in: ['queued', 'initiated', 'ringing', 'in_progress'] },
      providerCallId: { not: null },
    },
  });
  const provider = injectedProvider ?? providerFromEnv(env);
  for (const row of rows)
    try {
      if (row.state === 'in_progress') await provider.endProductionCall(row.providerCallId!);
      else await provider.cancelProductionCall(row.providerCallId!);
      const confirmed = await provider
        .getProductionCallStatus(row.providerCallId!)
        .then((status) => ['canceled', 'completed'].includes(status.status))
        .catch(() => false);
      await prisma.realCallExecution.update({
        where: { id: row.id },
        data: { emergencyCancelStatus: confirmed ? 'confirmed' : 'requested' },
      });
    } catch {
      await prisma.$transaction([
        prisma.realCallExecution.update({
          where: { id: row.id },
          data: { emergencyCancelStatus: 'failed' },
        }),
        prisma.productionIncident.create({
          data: {
            organizationId: row.organizationId,
            category: 'emergency_cancel_failed',
            entityType: 'real_call_execution',
            entityId: row.id,
            summary: 'Twilio緊急停止の状態確認に失敗しました',
            sanitizedDetails: { provider: 'twilio', state: row.state },
            dueAt: new Date(Date.now() + 900_000),
          },
        }),
      ]);
    }
  if (stop.authorizationId) {
    const failed = await prisma.realCallExecution.count({
      where: {
        authorizationId: stop.authorizationId,
        emergencyCancelStatus: { in: ['failed', 'requested'] },
      },
    });
    await prisma.productionTestAuthorization.updateMany({
      where: { id: stop.authorizationId },
      data: { rollbackStatus: failed ? 'failed' : 'completed' },
    });
  }
}

export async function expireTwilioAuthorizations(prisma: PrismaClient, now = new Date()) {
  const expired = await prisma.productionTestAuthorization.findMany({
    where: { status: { in: ['approved', 'active', 'suspended'] }, endsAt: { lte: now } },
  });
  for (const authorization of expired)
    await prisma.$transaction(async (tx) => {
      await tx.productionTestAuthorization.update({
        where: { id: authorization.id },
        data: { status: 'expired', decisionReason: 'test_window_expired' },
      });
      await tx.realCallExecution.updateMany({
        where: { authorizationId: authorization.id, state: 'reserved' },
        data: { state: 'canceled', endedAt: now },
      });
      const anotherActive = await tx.productionTestAuthorization.count({
        where: {
          organizationId: authorization.organizationId,
          id: { not: authorization.id },
          status: 'active',
          startsAt: { lte: now },
          endsAt: { gt: now },
        },
      });
      if (!anotherActive)
        await tx.providerConfiguration.updateMany({
          where: { organizationId: authorization.organizationId, provider: 'twilio' },
          data: { productionEnabled: false },
        });
      await tx.auditLog.create({
        data: {
          organizationId: authorization.organizationId,
          action: 'twilio_limited_test.expired',
          entityType: 'production_test_authorization',
          entityId: authorization.id,
          afterData: { status: 'expired', providerDisabled: !anotherActive },
        },
      });
    });
  return expired.length;
}

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
  const provider = injectedProvider ?? providerFromEnv(env);
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
function ready(env: WorkerEnv, release: string, written: string) {
  return (
    env.NODE_ENV === 'production' &&
    env.VOICE_PROVIDER === 'twilio' &&
    env.PRODUCTION_CALLS_ENABLED &&
    env.PRODUCTION_PROVIDER_ALLOWLIST.split(',').includes('twilio') &&
    env.RELEASE_COMMIT === release &&
    release === written &&
    Boolean(
      env.TWILIO_ACCOUNT_SID &&
      env.TWILIO_API_KEY_SID &&
      env.TWILIO_API_KEY_SECRET &&
      env.TWILIO_AUTH_TOKEN &&
      env.TWILIO_FROM_NUMBER &&
      env.TWILIO_STATUS_CALLBACK_BASE_URL &&
      env.TWILIO_TWIML_BASE_URL,
    )
  );
}
function providerFromEnv(env: WorkerEnv) {
  if (
    !env.TWILIO_ACCOUNT_SID ||
    !env.TWILIO_API_KEY_SID ||
    !env.TWILIO_API_KEY_SECRET ||
    !env.TWILIO_AUTH_TOKEN
  )
    throw new Error('twilio_credentials_unavailable');
  return new TwilioVoiceProvider({
    accountSid: env.TWILIO_ACCOUNT_SID,
    apiKeySid: env.TWILIO_API_KEY_SID,
    apiKeySecret: env.TWILIO_API_KEY_SECRET,
    authToken: env.TWILIO_AUTH_TOKEN,
    region: env.TWILIO_REGION,
    edge: env.TWILIO_EDGE,
    estimatedCostMinorPerMinute: env.TWILIO_ESTIMATED_COST_MINOR_PER_MINUTE,
    currency: 'JPY',
  });
}
async function reject(prisma: PrismaClient, id: string, organizationId: string, reason: string) {
  await prisma.realCallExecution.update({ where: { id }, data: { state: 'failed' } });
  await prisma.auditLog.create({
    data: {
      organizationId,
      action: 'twilio_call.rejected',
      entityType: 'real_call_execution',
      entityId: id,
      afterData: { reason },
    },
  });
}
function fingerprint(value: string) {
  return value.length < 10 ? 'masked' : `${value.slice(0, 4)}…${value.slice(-4)}`;
}
