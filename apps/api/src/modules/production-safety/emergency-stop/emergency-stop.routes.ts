import type { FastifyInstance } from 'fastify';

import {
  createEmergencyStopController,
  type EmergencyStopControllerDependencies,
} from './emergency-stop.controller.js';

export function registerEmergencyStopRoutes(
  app: FastifyInstance,
  deps: EmergencyStopControllerDependencies,
) {
  const controller = createEmergencyStopController(deps);
  app.get('/api/v1/emergency-stops', controller.list);
  app.post('/api/v1/emergency-stops', controller.activate);
  app.post('/api/v1/emergency-stops/:id/release', controller.release);
}
