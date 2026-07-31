import type { FastifyInstance } from 'fastify';
import type { ProductControllerDependencies } from '../products/product.controller.js';
import { createCampaignController } from './campaign.controller.js';

export function registerCampaignRoutes(app: FastifyInstance, deps: ProductControllerDependencies) {
  const controller = createCampaignController(deps);
  app.get('/api/v1/campaigns', controller.list);
  app.get('/api/v1/campaigns/:id', controller.detail);
  app.post('/api/v1/campaigns', controller.create);
  app.patch('/api/v1/campaigns/:id', controller.update);
  app.post('/api/v1/campaigns/:id/validate', controller.validate);
  app.post('/api/v1/campaigns/:id/approve', controller.approve);
  app.post('/api/v1/campaigns/:id/start', controller.start);
  app.post('/api/v1/campaigns/:id/pause', controller.pause);
  app.post('/api/v1/campaigns/:id/resume', controller.resume);
  app.post('/api/v1/campaigns/:id/cancel', controller.cancel);
}
