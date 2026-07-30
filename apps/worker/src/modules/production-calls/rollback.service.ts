import type { PrismaClient } from '@sales-ai/database';
import type { WorkerEnv } from '@sales-ai/validation';
import type { ProductionVoiceProvider } from '@sales-ai/voice-provider';
import { productionProviderFromEnv } from './provider.js';

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
  const provider = injectedProvider ?? productionProviderFromEnv(env);
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
