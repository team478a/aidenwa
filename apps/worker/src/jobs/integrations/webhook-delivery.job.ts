import type { PrismaClient } from '@sales-ai/database';
import { deriveWebhookSecret, hashWebhookSecret, signWebhook } from '@sales-ai/shared';

const MAX_ATTEMPTS = 5;

export async function deliverExternalWebhook(
  prisma: PrismaClient,
  masterKey: string,
  deliveryId: string,
  send: typeof fetch = fetch,
) {
  const delivery = await prisma.externalWebhookDelivery.findUnique({
    where: { id: deliveryId },
    include: { webhookEvent: { include: { integrationClient: true } } },
  });
  if (!delivery || delivery.status === 'delivered' || delivery.status === 'failed') return;
  const { webhookEvent: event } = delivery;
  const endpoint = event.integrationClient.webhookEndpoint;
  if (!endpoint) return failDelivery(prisma, delivery.id, event, 'WEBHOOK_ENDPOINT_MISSING');
  const secret = deriveWebhookSecret(masterKey, event.integrationClientId);
  if (hashWebhookSecret(secret) !== event.integrationClient.webhookSecretHash)
    return failDelivery(prisma, delivery.id, event, 'WEBHOOK_SECRET_MISMATCH');
  const rawBody = JSON.stringify(event.payload);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  await prisma.externalWebhookDelivery.update({
    where: { id: delivery.id },
    data: { status: 'delivering', lastAttemptAt: new Date() },
  });
  try {
    const response = await send(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-aidenwa-event-id': event.publicId,
        'x-aidenwa-timestamp': timestamp,
        'x-aidenwa-signature': signWebhook(secret, timestamp, rawBody),
      },
      body: rawBody,
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    await prisma.externalWebhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: 'delivered',
        attemptCount: { increment: 1 },
        responseStatus: response.status,
        deliveredAt: new Date(),
        nextAttemptAt: null,
        failureCode: null,
      },
    });
  } catch (cause) {
    const failureCode = cause instanceof Error ? cause.message.slice(0, 100) : 'UNKNOWN_ERROR';
    await failDelivery(prisma, delivery.id, event, failureCode, delivery.attemptCount + 1);
    throw cause;
  }
}

async function failDelivery(
  prisma: PrismaClient,
  deliveryId: string,
  event: { id: string; organizationId: string; eventType: string },
  failureCode: string,
  attempt = MAX_ATTEMPTS,
) {
  const terminal = attempt >= MAX_ATTEMPTS;
  const delays = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000, 12 * 60 * 60_000];
  await prisma.externalWebhookDelivery.update({
    where: { id: deliveryId },
    data: {
      status: terminal ? 'failed' : 'retrying',
      attemptCount: attempt,
      lastAttemptAt: new Date(),
      nextAttemptAt: terminal
        ? null
        : new Date(Date.now() + (delays[attempt - 1] ?? delays.at(-1)!)),
      failureCode,
    },
  });
  if (terminal)
    await prisma.productionIncident.upsert({
      where: { dedupeKey: `external-webhook:${event.id}` },
      update: {},
      create: {
        organizationId: event.organizationId,
        category: 'external_webhook_retry_exhausted',
        entityType: 'external_webhook_event',
        entityId: event.id,
        dedupeKey: `external-webhook:${event.id}`,
        summary: 'External Webhookの再送上限に達しました',
        sanitizedDetails: { eventType: event.eventType, failureCode },
        dueAt: new Date(Date.now() + 3_600_000),
      },
    });
}
