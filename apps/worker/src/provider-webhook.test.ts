import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient, processStoredProviderWebhook } from '@sales-ai/database';
import { processProviderWebhook } from './provider-webhook';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url:
        process.env.DATABASE_URL ??
        'postgresql://sales_ai:sales_ai_dev@localhost:5432/sales_ai?schema=public',
    },
  },
});
let org = '';
beforeAll(async () => {
  const value = `webhook-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`;
  org = (await prisma.organization.create({ data: { name: value, slug: value } })).id;
});
afterAll(async () => {
  await prisma.productionIncident.deleteMany({ where: { organizationId: org } });
  await prisma.providerWebhookEvent.deleteMany({ where: { organizationId: org } });
  await prisma.realCallExecution.deleteMany({ where: { organizationId: org } });
  await prisma.organization.delete({ where: { id: org } });
  await prisma.$disconnect();
});
describe('Provider webhook retry worker', () => {
  it('fails once and becomes idempotently processed on redelivery', async () => {
    const event = await prisma.providerWebhookEvent.create({
      data: {
        organizationId: org,
        provider: 'mock',
        providerEventId: crypto.randomUUID(),
        eventType: 'mock.fail_once',
        eventTimestamp: new Date(),
        processingStatus: 'pending',
      },
    });
    await expect(processProviderWebhook(prisma, event.id)).rejects.toThrow(
      'simulated_webhook_processing_failure',
    );
    expect(
      (await prisma.providerWebhookEvent.findUniqueOrThrow({ where: { id: event.id } }))
        .processingStatus,
    ).toBe('retrying');
    await processProviderWebhook(prisma, event.id);
    await processProviderWebhook(prisma, event.id);
    expect(
      await prisma.providerWebhookEvent.findUniqueOrThrow({ where: { id: event.id } }),
    ).toMatchObject({ processingStatus: 'processed', failureCode: null });
  });

  it('rolls back a failed call update and succeeds on BullMQ redelivery', async () => {
    const execution = await prisma.realCallExecution.create({
      data: {
        organizationId: org,
        authorizationId: crypto.randomUUID(),
        campaignId: crypto.randomUUID(),
        companyId: crypto.randomUUID(),
        phoneNumberId: crypto.randomUUID(),
        allowlistId: crypto.randomUUID(),
        idempotencyKey: crypto.randomUUID(),
        estimatedCostMinor: 100,
        reservedCostMinor: 100,
        currency: 'JPY',
      },
    });
    const callSid = `CA${'a'.repeat(32)}`;
    const event = await prisma.providerWebhookEvent.create({
      data: {
        organizationId: org,
        provider: 'twilio',
        providerEventId: crypto.randomUUID(),
        eventType: 'twilio.completed',
        eventTimestamp: new Date(),
        sequenceNumber: 4,
        normalizedData: {
          executionId: execution.id,
          callSid,
          callFingerprint: 'CAaa…aaaa',
          state: 'completed',
        },
        processingStatus: 'received',
      },
    });
    await expect(
      processStoredProviderWebhook(prisma, event.id, {
        beforeCommit: () => {
          throw new Error('simulated_call_update_failure');
        },
      }),
    ).rejects.toThrow('simulated_call_update_failure');
    expect(
      await prisma.realCallExecution.findUniqueOrThrow({ where: { id: execution.id } }),
    ).toMatchObject({
      state: 'reserved',
      lastWebhookSequence: -1,
    });
    expect(
      await prisma.providerWebhookEvent.findUniqueOrThrow({ where: { id: event.id } }),
    ).toMatchObject({
      processingStatus: 'retrying',
      processingAttempts: 1,
    });
    await processStoredProviderWebhook(prisma, event.id);
    await processStoredProviderWebhook(prisma, event.id);
    expect(
      await prisma.realCallExecution.findUniqueOrThrow({ where: { id: execution.id } }),
    ).toMatchObject({
      state: 'completed',
      lastWebhookSequence: 4,
      providerCallId: callSid,
    });
    expect(
      await prisma.providerWebhookEvent.findUniqueOrThrow({ where: { id: event.id } }),
    ).toMatchObject({
      processingStatus: 'processed',
      processingAttempts: 2,
    });
  });

  it('opens only one sanitized incident when retry attempts are exhausted', async () => {
    const event = await prisma.providerWebhookEvent.create({
      data: {
        organizationId: org,
        provider: 'twilio',
        providerEventId: crypto.randomUUID(),
        eventType: 'twilio.completed',
        eventTimestamp: new Date(),
        normalizedData: {},
        processingStatus: 'received',
      },
    });
    await expect(
      processStoredProviderWebhook(prisma, event.id, { maxAttempts: 1 }),
    ).rejects.toThrow('invalid_webhook_normalized_data');
    await processStoredProviderWebhook(prisma, event.id, { maxAttempts: 1 });
    expect(
      await prisma.productionIncident.count({
        where: { dedupeKey: `provider-webhook:${event.id}` },
      }),
    ).toBe(1);
    const incident = await prisma.productionIncident.findUniqueOrThrow({
      where: { dedupeKey: `provider-webhook:${event.id}` },
    });
    expect(JSON.stringify(incident.sanitizedDetails)).not.toMatch(/CallSid|phone|cookie|session/iu);
  });
});
