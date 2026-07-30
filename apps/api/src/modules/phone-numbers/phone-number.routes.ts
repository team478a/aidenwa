import type { FastifyInstance } from 'fastify';

import type { CompanyControllerDependencies } from '../companies/company.controller.js';
import { createPhoneNumberController } from './phone-number.controller.js';

export function registerPhoneNumberRoutes(
  app: FastifyInstance,
  deps: CompanyControllerDependencies,
) {
  const controller = createPhoneNumberController(deps);
  app.get('/api/v1/companies/:id/phone-numbers', controller.list);
  app.post('/api/v1/companies/:id/phone-numbers', controller.create);
  app.patch('/api/v1/phone-numbers/:id', controller.update);
  app.delete('/api/v1/phone-numbers/:id', controller.remove);
}
