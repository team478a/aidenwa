import type { FastifyInstance } from 'fastify';

import {
  createProductionPolicyController,
  type ProductionPolicyControllerDependencies,
} from './production-policy.controller.js';

export function registerProductionPolicyRoutes(
  app: FastifyInstance,
  deps: ProductionPolicyControllerDependencies,
) {
  const controller = createProductionPolicyController(deps);
  app.get('/api/v1/production-policy', controller.read);
  app.put('/api/v1/production-policy', controller.update);
}
