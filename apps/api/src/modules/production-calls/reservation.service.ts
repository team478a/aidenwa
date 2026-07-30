import { Prisma, evaluateProductionGate, type PrismaClient } from '@sales-ai/database';
import type { ApiEnv } from '@sales-ai/validation';
import { enqueueOutbox } from '../../outbox.js';
import { activationBlockers } from './production-call.policy.js';

type ProductionCallRequest = {
  authorizationId: string;
  campaignId: string;
  companyId: string;
  phoneNumberId: string;
  allowlistId: string;
};

export class ProductionReservationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function reserveProductionCall(
  prisma: PrismaClient,
  env: ApiEnv,
  organizationId: string,
  input: ProductionCallRequest,
) {
  const authorization = await prisma.productionTestAuthorization.findFirst({
    where: {
      id: input.authorizationId,
      organizationId,
      status: 'active',
      startsAt: { lte: new Date() },
      endsAt: { gt: new Date() },
    },
  });
  if (!authorization)
    throw new ProductionReservationError(
      'LIMITED_TEST_INACTIVE',
      '有効な限定テスト承認がありません',
    );
  const blockers = activationBlockers(
    env,
    authorization.releaseCommit,
    authorization.writtenApprovalCommit,
  );
  if (blockers.length)
    throw new ProductionReservationError('PRODUCTION_DISABLED', blockers.join(','));
  const allow = await prisma.testCallAllowlist.findFirst({
    where: {
      id: input.allowlistId,
      organizationId,
      active: true,
      consentConfirmed: true,
      expiresAt: { gt: new Date() },
    },
  });
  const phone = await prisma.phoneNumber.findFirst({
    where: {
      id: input.phoneNumberId,
      organizationId,
      companyId: input.companyId,
      isDeleted: false,
    },
  });
  if (!allow || !phone || allow.normalizedPhoneNumber !== phone.normalizedNumber)
    throw new ProductionReservationError(
      'DESTINATION_NOT_ALLOWED',
      '許可番号と架電先が一致しません',
    );
  if (!(authorization.approvedAllowlistIds as string[]).includes(allow.id))
    throw new ProductionReservationError('DESTINATION_NOT_APPROVED', '限定承認の対象外です');
  const gate = await evaluateProductionGate(prisma, {
    organizationId,
    campaignId: input.campaignId,
    companyId: input.companyId,
    phoneNumberId: phone.id,
    provider: 'twilio',
    region: allow.region,
  });
  if (!gate.allowed)
    throw new ProductionReservationError('PRODUCTION_GATE_REJECTED', gate.reasonCodes.join(','));
  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setUTCHours(0, 0, 0, 0);
  const hourStart = new Date(now.getTime() - 3_600_000);
  const estimatedCostMinor =
    Math.ceil(authorization.maxCallSeconds / 60) * env.TWILIO_ESTIMATED_COST_MINOR_PER_MINUTE;
  const execution = await prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${organizationId}, 0))`,
      );
      const [used, sameDestination, activeCalls, todayCalls, hourlyCalls, reserved] =
        await Promise.all([
          tx.realCallExecution.count({ where: { authorizationId: authorization.id } }),
          tx.realCallExecution.count({
            where: { authorizationId: authorization.id, phoneNumberId: phone.id },
          }),
          tx.realCallExecution.count({
            where: {
              organizationId,
              state: { in: ['reserved', 'queued', 'initiated', 'ringing', 'in_progress'] },
            },
          }),
          tx.realCallExecution.count({
            where: { authorizationId: authorization.id, createdAt: { gte: dayStart } },
          }),
          tx.realCallExecution.count({
            where: { authorizationId: authorization.id, createdAt: { gte: hourStart } },
          }),
          tx.realCallExecution.aggregate({
            where: { authorizationId: authorization.id },
            _sum: { reservedCostMinor: true },
          }),
        ]);
      if (used >= authorization.maxCalls)
        throw new ProductionReservationError('LIMITED_TEST_LIMIT', '最大5件に到達しています');
      if (sameDestination)
        throw new ProductionReservationError(
          'DESTINATION_ALREADY_CALLED',
          '同じ番号へ再発信できません',
        );
      if (activeCalls)
        throw new ProductionReservationError('CONCURRENT_CALL_LIMIT', '同時通話上限は1件です');
      if (todayCalls >= 5 || hourlyCalls >= 5)
        throw new ProductionReservationError(
          'REAL_CALL_RATE_LIMIT',
          '日次または時間上限に到達しています',
        );
      if (
        (reserved._sum.reservedCostMinor ?? 0) + estimatedCostMinor >
        authorization.budgetLimitMinor
      )
        throw new ProductionReservationError('BUDGET_LIMIT', '予算上限を超えるため予約できません');
      const created = await tx.realCallExecution.create({
        data: {
          organizationId,
          authorizationId: authorization.id,
          campaignId: input.campaignId,
          companyId: input.companyId,
          phoneNumberId: phone.id,
          allowlistId: allow.id,
          idempotencyKey: `twilio:${authorization.id}:${phone.id}`,
          estimatedCostMinor,
          reservedCostMinor: estimatedCostMinor,
          currency: authorization.currency,
        },
      });
      await enqueueOutbox(tx, {
        organizationId,
        eventType: 'twilio-call',
        aggregateType: 'real_call_execution',
        aggregateId: created.id,
        payload: { executionId: created.id },
      });
      return created;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
  return {
    execution,
    normalizedPhoneNumber: phone.normalizedNumber,
    estimatedCostMinor,
    currency: authorization.currency,
  };
}
