import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { enqueueOutbox } from './outbox.js';

export async function createExternalCallWebhook(
  tx: Prisma.TransactionClient,
  call: {
    id: string;
    publicId: string;
    organizationId: string;
    integrationClientId: string;
    externalCallId: string;
    externalCustomerId: string;
  },
  eventType: string,
  data: Prisma.InputJsonObject,
) {
  const publicId = `evt_${randomUUID().replaceAll('-', '')}`;
  const createdAt = new Date();
  const event = await tx.externalWebhookEvent.upsert({
    where: {
      integrationClientId_eventType_externalCallExecutionId: {
        integrationClientId: call.integrationClientId,
        eventType,
        externalCallExecutionId: call.id,
      },
    },
    update: {},
    create: {
      publicId,
      organizationId: call.organizationId,
      integrationClientId: call.integrationClientId,
      externalCallExecutionId: call.id,
      eventType,
      payload: {
        event_id: publicId,
        event_type: eventType,
        created_at: createdAt.toISOString(),
        data: {
          external_customer_id: call.externalCustomerId,
          external_call_id: call.externalCallId,
          call_id: call.publicId,
          ...data,
        },
      },
    },
  });
  const delivery = await tx.externalWebhookDelivery.upsert({
    where: { webhookEventId: event.id },
    update: {},
    create: { webhookEventId: event.id },
  });
  await enqueueOutbox(tx, {
    organizationId: call.organizationId,
    eventType: 'webhook-delivery',
    aggregateType: 'external_webhook_delivery',
    aggregateId: delivery.id,
    payload: { deliveryId: delivery.id },
  });
  return event;
}
