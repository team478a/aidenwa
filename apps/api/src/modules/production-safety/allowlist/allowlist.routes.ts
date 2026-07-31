import type { FastifyInstance } from 'fastify';
import {
  createAllowlistController,
  type AllowlistControllerDependencies,
} from './allowlist.controller.js';

export function registerAllowlistRoutes(
  app: FastifyInstance,
  deps: AllowlistControllerDependencies,
) {
  const controller = createAllowlistController(deps);
  app.get('/api/v1/test-call-allowlist', controller.list);
  app.post('/api/v1/test-call-allowlist', controller.register);
  app.post('/api/v1/test-call-allowlist/:id/disable', controller.disable);
}
