import { createHmac } from 'node:crypto';
import { evaluateProductionGate, type PrismaClient } from '@sales-ai/database';
import type { WorkerEnv } from '@sales-ai/validation';
import type { ProductionVoiceProvider } from '@sales-ai/voice-provider';
import {
  productionProviderFromEnv,
  productionProviderReady,
  providerCallFingerprint,
} from './provider.js';
import { rejectProductionCall } from './production-call.repository.js';

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
    await rejectProductionCall(
      prisma,
      execution.id,
      execution.organizationId,
      'authorization_inactive',
    );
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
    !productionProviderReady(
      env,
      authorization.releaseCommit,
      authorization.writtenApprovalCommit,
    ) ||
    !config?.allowed ||
    !config.productionEnabled ||
    !sourceMatches
  ) {
    await rejectProductionCall(
      prisma,
      execution.id,
      execution.organizationId,
      'production_disabled',
    );
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
    await rejectProductionCall(prisma, execution.id, execution.organizationId, 'real_call_limit');
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
    await rejectProductionCall(
      prisma,
      execution.id,
      execution.organizationId,
      'destination_not_allowed',
    );
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
    await rejectProductionCall(
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
    await rejectProductionCall(prisma, execution.id, execution.organizationId, 'call_limit');
    return;
  }
  const spend = await prisma.realCallExecution.aggregate({
    where: { authorizationId: authorization.id },
    _sum: { reservedCostMinor: true },
  });
  if ((spend._sum.reservedCostMinor ?? 0) > authorization.budgetLimitMinor) {
    await rejectProductionCall(prisma, execution.id, execution.organizationId, 'budget_limit');
    return;
  }
  const provider = injectedProvider ?? productionProviderFromEnv(env);
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
        providerCallIdFingerprint: providerCallFingerprint(call.providerCallId),
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
