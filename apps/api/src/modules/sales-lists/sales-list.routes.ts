import type { FastifyInstance } from 'fastify';

import {
  createSalesListController,
  type SalesListControllerDependencies,
} from './sales-list.controller.js';

export function registerSalesListRoutes(
  app: FastifyInstance,
  deps: SalesListControllerDependencies,
) {
  const controller = createSalesListController(deps);
  app.get('/api/v1/sales-lists', controller.list);
  app.post('/api/v1/sales-lists', controller.create);
  app.get('/api/v1/sales-lists/:id', controller.detail);
  app.patch('/api/v1/sales-lists/:id', controller.update);
  app.delete('/api/v1/sales-lists/:id', controller.remove);
  app.get('/api/v1/sales-lists/:id/companies', controller.companies);
  app.post('/api/v1/sales-lists/:id/companies', controller.addCompanies);
  app.delete('/api/v1/sales-lists/:id/companies/:companyId', controller.removeCompany);
  app.post('/api/v1/sales-lists/:id/preview', controller.preview);
}
