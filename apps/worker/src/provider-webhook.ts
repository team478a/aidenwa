import type { PrismaClient } from '@sales-ai/database';

export async function processProviderWebhook(prisma: PrismaClient, eventId: string) {
  const event = await prisma.providerWebhookEvent.findUnique({ where: { id: eventId } });
  if (!event || event.processingStatus === 'processed') return;
  if (event.eventType === 'mock.fail_once' && event.failureCode === null) {
    await prisma.providerWebhookEvent.update({
      where: { id: event.id },
      data: { processingStatus: 'retrying', failureCode: 'simulated_first_failure' },
    });
    throw new Error('simulated_webhook_processing_failure');
  }
  await prisma.providerWebhookEvent.update({
    where: { id: event.id },
    data: { processingStatus: 'processed', failureCode: null, processedAt: new Date() },
  });
}
