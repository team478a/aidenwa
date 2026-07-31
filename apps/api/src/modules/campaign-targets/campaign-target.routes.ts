import type { FastifyInstance } from 'fastify';
import type { ProductControllerDependencies } from '../products/product.controller.js';
import { createCampaignTargetController } from './campaign-target.controller.js';

export function registerCampaignTargetRoutes(
  app: FastifyInstance,
  deps: ProductControllerDependencies,
) {
  const controller = createCampaignTargetController(deps);
  app.post('/api/v1/campaigns/:id/targets/preview', controller.preview);
  app.post('/api/v1/campaigns/:id/targets/materialize', controller.materialize);
  app.get('/api/v1/campaigns/:id/targets', controller.list);
}
