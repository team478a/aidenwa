import type { FastifyInstance } from 'fastify';

import {
  createCompanyController,
  type CompanyControllerDependencies,
} from './company.controller.js';

export function registerCompanyRoutes(app: FastifyInstance, deps: CompanyControllerDependencies) {
  const controller = createCompanyController(deps);
  app.get('/api/v1/companies', controller.list);
  app.post('/api/v1/companies', controller.create);
  app.get('/api/v1/companies/:id', controller.detail);
  app.patch('/api/v1/companies/:id', controller.update);
  app.delete('/api/v1/companies/:id', controller.remove);
  app.get('/api/v1/companies/:id/duplicates', controller.duplicates);
}
