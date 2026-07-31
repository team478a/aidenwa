import type { FastifyReply, FastifyRequest } from 'fastify';
import { mockWebhookSchema } from '@sales-ai/validation';
import { writeAudit } from '../../../audit.js';
import type { ProductControllerDependencies } from '../../products/product.controller.js';
import { isFreshWebhook, sanitizeWebhookData, validMockSignature } from './mock-webhook.policy.js';
import { createMockWebhook, enqueueMockWebhook, findMockWebhook } from './mock-webhook.service.js';

export type MockWebhookDependencies = ProductControllerDependencies & {
  webhookSecret: string;
  redisUrl: string;
};

export function createMockWebhookController(deps: MockWebhookDependencies) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = mockWebhookSchema.safeParse(request.body);
    if (!parsed.success) return deps.error(reply, 400, 'VALIDATION_ERROR', 'Webhook形式が不正です');
    const timestamp = request.headers['x-mock-timestamp'];
    const signature = request.headers['x-mock-signature'];
    if (
      typeof timestamp !== 'string' ||
      typeof signature !== 'string' ||
      !isFreshWebhook(timestamp)
    )
      return deps.error(reply, 401, 'WEBHOOK_EXPIRED', 'Webhook timestampが期限切れです');
    if (!validMockSignature(deps.webhookSecret, timestamp, request.body, signature)) {
      await writeAudit(deps.prisma, {
        organizationId: parsed.data.organizationId,
        action: 'provider_webhook.signature_error',
        entityType: 'provider_webhook',
        afterData: { provider: 'mock', eventId: parsed.data.eventId },
      });
      return deps.error(reply, 401, 'INVALID_SIGNATURE', '署名が不正です');
    }
    const existing = await findMockWebhook(deps.prisma, parsed.data.eventId);
    if (existing) {
      await writeAudit(deps.prisma, {
        organizationId: existing.organizationId,
        action: 'provider_webhook.duplicate',
        entityType: 'provider_webhook_event',
        entityId: existing.id,
        afterData: { provider: 'mock', eventId: parsed.data.eventId },
      });
      return { accepted: true, duplicate: true, eventId: existing.id };
    }
    const event = await createMockWebhook(
      deps.prisma,
      parsed.data,
      sanitizeWebhookData(parsed.data.data),
    );
    if (event.processingStatus === 'pending') await enqueueMockWebhook(deps.redisUrl, event.id);
    return reply.code(202).send({ accepted: true, duplicate: false, eventId: event.id });
  };
}
