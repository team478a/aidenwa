import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { Prisma, type PrismaClient } from '@sales-ai/database';

export function findMockWebhook(prisma: PrismaClient, eventId: string) {
  return prisma.providerWebhookEvent.findUnique({
    where: { provider_providerEventId: { provider: 'mock', providerEventId: eventId } },
  });
}

export function createMockWebhook(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    eventId: string;
    eventType: string;
    timestamp: string;
    callAttemptId?: string;
    campaignId?: string;
    sequenceNumber?: number;
  },
  safeData: Record<string, unknown>,
) {
  const pending = input.eventType === 'mock.fail_once';
  return prisma.providerWebhookEvent.create({
    data: {
      organizationId: input.organizationId,
      provider: 'mock',
      providerEventId: input.eventId,
      eventType: input.eventType,
      eventTimestamp: new Date(input.timestamp),
      callAttemptId: input.callAttemptId ?? null,
      campaignId: input.campaignId ?? null,
      sequenceNumber: input.sequenceNumber ?? null,
      normalizedData: safeData as Prisma.InputJsonValue,
      processingStatus: pending ? 'pending' : 'processed',
      processedAt: pending ? null : new Date(),
    },
  });
}

export async function enqueueMockWebhook(redisUrl: string, eventId: string) {
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  const queue = new Queue('sales-ai-jobs', { connection });
  try {
    await queue.add(
      'provider-webhook',
      { eventId },
      {
        jobId: `provider-webhook-${eventId}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 100 },
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    );
  } finally {
    await queue.close();
    connection.disconnect();
  }
}
