import type { FastifyInstance } from 'fastify';

import type { CompanyControllerDependencies } from '../companies/company.controller.js';
import { createOptOutController } from './opt-out.controller.js';

export function registerOptOutRoutes(app: FastifyInstance, deps: CompanyControllerDependencies) {
  const controller = createOptOutController(deps);
  app.get('/api/v1/opt-outs', controller.list);
  app.post('/api/v1/opt-outs', controller.create);
  app.get('/api/v1/opt-outs/check', controller.check);
  app.post('/api/v1/opt-outs/:id/release', controller.release);
}
