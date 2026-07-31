import type { FastifyInstance } from 'fastify';
import {
  createMockWebhookController,
  type MockWebhookDependencies,
} from './mock-webhook.controller.js';

export function registerMockWebhookRoutes(app: FastifyInstance, deps: MockWebhookDependencies) {
  app.post('/api/v1/provider-webhooks/mock', createMockWebhookController(deps));
}
