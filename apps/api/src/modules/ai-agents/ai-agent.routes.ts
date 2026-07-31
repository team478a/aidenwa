import type { FastifyInstance } from 'fastify';

import type { ProductControllerDependencies } from '../products/product.controller.js';
import { createAiAgentController } from './ai-agent.controller.js';

export function registerAiAgentRoutes(app: FastifyInstance, deps: ProductControllerDependencies) {
  const controller = createAiAgentController(deps);
  app.get('/api/v1/ai-agents', controller.list);
  app.post('/api/v1/ai-agents', controller.create);
  app.get('/api/v1/ai-agents/:id', controller.detail);
  app.patch('/api/v1/ai-agents/:id', controller.update);
  app.post('/api/v1/ai-agents/:id/archive', controller.archive);
  app.post('/api/v1/ai-agents/:id/versions', controller.createVersion);
  app.post('/api/v1/ai-agent-versions/:id/publish', controller.publishVersion);
}
