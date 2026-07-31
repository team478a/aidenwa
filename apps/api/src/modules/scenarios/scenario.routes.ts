import type { FastifyInstance } from 'fastify';

import type { ProductControllerDependencies } from '../products/product.controller.js';
import { createScenarioController } from './scenario.controller.js';

export function registerScenarioRoutes(app: FastifyInstance, deps: ProductControllerDependencies) {
  const controller = createScenarioController(deps);
  app.get('/api/v1/scenarios', controller.list);
  app.post('/api/v1/scenarios', controller.create);
  app.get('/api/v1/scenarios/:id', controller.detail);
  app.patch('/api/v1/scenarios/:id', controller.update);
  app.post('/api/v1/scenarios/:id/versions', controller.createVersion);
  app.put('/api/v1/scenario-versions/:id/graph', controller.saveGraph);
  app.post('/api/v1/scenario-versions/:id/validate', controller.validate);
  app.post('/api/v1/scenario-versions/:id/publish', controller.publish);
  app.post('/api/v1/scenario-versions/:id/simulate', controller.simulate);
}
