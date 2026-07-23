import { Prisma, type PrismaClient } from '@prisma/client';

export type OutboxEventType =
  'company-import' | 'mock-call' | 'twilio-call' | 'twilio-emergency-stop';

type OutboxClient = Prisma.TransactionClient | PrismaClient;

export async function enqueueOutbox(
  tx: OutboxClient,
  input: {
    organizationId?: string | null;
    eventType: OutboxEventType;
    aggregateType: string;
    aggregateId: string;
    payload: Prisma.InputJsonObject;
  },
) {
  return tx.outboxEvent.upsert({
    where: {
      eventType_aggregateId: {
        eventType: input.eventType,
        aggregateId: input.aggregateId,
      },
    },
    update: {},
    create: {
      organizationId: input.organizationId ?? null,
      eventType: input.eventType,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      payload: input.payload,
    },
  });
}
