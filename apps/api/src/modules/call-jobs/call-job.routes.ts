import type { FastifyInstance } from 'fastify';

import {
  createCallJobController,
  type CallJobControllerDependencies,
} from './call-job.controller.js';

export function registerCallJobRoutes(app: FastifyInstance, deps: CallJobControllerDependencies) {
  const controller = createCallJobController(deps);
  app.post('/api/v1/campaigns/:id/mock-calls/run-next', controller.runNext);
  app.get('/api/v1/call-jobs', controller.list);
  app.get('/api/v1/call-jobs/:id', controller.detail);
  app.post('/api/v1/call-jobs/:id/cancel', controller.cancel);
  app.get('/api/v1/call-attempts/:id', controller.attemptDetail);
  app.post('/api/v1/call-attempts/:id/outcome', controller.updateOutcome);
}
