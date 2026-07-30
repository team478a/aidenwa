import type { FastifyInstance } from 'fastify';

import type { CompanyControllerDependencies } from '../companies/company.controller.js';
import { createTagController } from './tag.controller.js';

export function registerTagRoutes(app: FastifyInstance, deps: CompanyControllerDependencies) {
  const controller = createTagController(deps);
  app.get('/api/v1/tags', controller.list);
  app.post('/api/v1/tags', controller.create);
  app.patch('/api/v1/tags/:id', controller.update);
  app.delete('/api/v1/tags/:id', controller.remove);
  app.get('/api/v1/companies/:id/tags', controller.listCompanies);
  app.post('/api/v1/companies/:id/tags', controller.assign);
  app.delete('/api/v1/companies/:id/tags/:tagId', controller.unassign);
}
