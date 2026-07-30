import type { FastifyInstance } from 'fastify';

import type { CompanyControllerDependencies } from '../companies/company.controller.js';
import { createContactController } from './contact.controller.js';

export function registerContactRoutes(app: FastifyInstance, deps: CompanyControllerDependencies) {
  const controller = createContactController(deps);
  app.get('/api/v1/companies/:id/contacts', controller.list);
  app.post('/api/v1/companies/:id/contacts', controller.create);
  app.patch('/api/v1/contacts/:id', controller.update);
  app.delete('/api/v1/contacts/:id', controller.remove);
}
