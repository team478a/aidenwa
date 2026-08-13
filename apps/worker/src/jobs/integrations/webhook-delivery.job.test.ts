import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@sales-ai/database';
import { deriveWebhookSecret, hashWebhookSecret, verifyWebhookSignature } from '@sales-ai/shared';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { deliverExternalWebhook } from './webhook-delivery.job.js';

const prisma = new PrismaClient();
const masterKey = 'webhook-master-key-at-least-32-bytes';
const organizationIds: string[] = [];
const clientIds: string[] = [];
const eventIds: string[] = [];

async function fixture(endpoint: string) {
  const organization = await prisma.organization.create({
    data: { name: randomUUID(), slug: randomUUID() },
  });
  organizationIds.push(organization.id);
  const clientId = randomUUID();
  const secret = deriveWebhookSecret(masterKey, clientId);
  const client = await prisma.integrationClient.create({
    data: {
      id: clientId,
      organizationId: organization.id,
      name: randomUUID(),
      environment: 'sandbox',
      apiKeyHash: randomUUID(),
      apiKeyPrefix: 'aid_test_test',
      allowedScopes: [],
      allowedCallProfiles: [],
      createdBy: randomUUID(),
      webhookEndpoint: endpoint,
      webhookSecretHash: hashWebhookSecret(secret),
    },
  });
  clientIds.push(client.id);
  const event = await prisma.externalWebhookEvent.create({
    data: {
      publicId: `evt_${randomUUID().replaceAll('-', '')}`,
      organizationId: organization.id,
      integrationClientId: client.id,
      eventType: 'call.completed',
      payload: {
        event_id: 'evt_test',
        event_type: 'call.completed',
        data: { status: 'completed' },
      },
      delivery: { create: {} },
    },
    include: { delivery: true },
  });
  eventIds.push(event.id);
  return { event, delivery: event.delivery!, secret };
}

afterAll(async () => {
  await prisma.productionIncident.deleteMany({
    where: { organizationId: { in: organizationIds } },
  });
  await prisma.externalWebhookDelivery.deleteMany({ where: { webhookEventId: { in: eventIds } } });
  await prisma.externalWebhookEvent.deleteMany({ where: { id: { in: eventIds } } });
  await prisma.integrationClient.deleteMany({ where: { id: { in: clientIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  await prisma.$disconnect();
});

describe('external webhook delivery', () => {
  it('delivers a verifiable signature once and makes redelivery harmless', async () => {
    const { event, delivery, secret } = await fixture('https://example.test/webhook');
    const send = vi.fn((_url: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      if (typeof init?.body !== 'string') throw new Error('expected_string_body');
      expect(headers.get('x-aidenwa-event-id')).toBe(event.publicId);
      expect(
        verifyWebhookSignature(
          secret,
          headers.get('x-aidenwa-timestamp')!,
          init.body,
          headers.get('x-aidenwa-signature')!,
        ),
      ).toBe(true);
      return Promise.resolve(new Response(null, { status: 204 }));
    });
    await deliverExternalWebhook(prisma, masterKey, delivery.id, send);
    await deliverExternalWebhook(prisma, masterKey, delivery.id, send);
    expect(send).toHaveBeenCalledTimes(1);
    expect(
      await prisma.externalWebhookDelivery.findUniqueOrThrow({ where: { id: delivery.id } }),
    ).toMatchObject({ status: 'delivered', attemptCount: 1 });
  });

  it('creates one sanitized Incident at retry exhaustion', async () => {
    const { event, delivery } = await fixture('https://example.test/fail');
    const send = vi.fn(() => Promise.resolve(new Response(null, { status: 503 })));
    for (let attempt = 0; attempt < 5; attempt += 1)
      await expect(deliverExternalWebhook(prisma, masterKey, delivery.id, send)).rejects.toThrow(
        'HTTP_503',
      );
    expect(
      await prisma.externalWebhookDelivery.findUniqueOrThrow({ where: { id: delivery.id } }),
    ).toMatchObject({ status: 'failed', attemptCount: 5, failureCode: 'HTTP_503' });
    expect(
      await prisma.productionIncident.count({
        where: { dedupeKey: `external-webhook:${event.id}` },
      }),
    ).toBe(1);
  });
});
