import type { FastifyInstance } from 'fastify';
import type { ProductControllerDependencies } from '../../products/product.controller.js';
import { createGateDecisionController } from './gate-decision.controller.js';
export function registerGateDecisionRoutes(
  app: FastifyInstance,
  deps: ProductControllerDependencies,
) {
  const controller = createGateDecisionController(deps);
  app.post('/api/v1/production-gate/evaluate', controller.evaluate);
  app.get('/api/v1/production-usage', controller.usage);
}
