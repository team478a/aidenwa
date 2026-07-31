import type { FastifyInstance } from 'fastify';

import {
  createReadinessController,
  type ReadinessControllerDependencies,
} from './readiness.controller.js';

export function registerReadinessRoutes(
  app: FastifyInstance,
  deps: ReadinessControllerDependencies,
) {
  const controller = createReadinessController(deps);
  app.get('/api/v1/production-readiness', controller.read);
}
