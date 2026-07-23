import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@sales-ai/database';
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
  await prisma.providerWebhookEvent.deleteMany({ where: { organizationId: org } });
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
});
