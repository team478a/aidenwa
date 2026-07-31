import type { FastifyInstance } from 'fastify';
import {
  createRealtimeSessionController,
  type RealtimeSessionDependencies,
} from './realtime-session.controller.js';

export function registerRealtimeSessionRoutes(
  app: FastifyInstance,
  deps: RealtimeSessionDependencies,
) {
  const controller = createRealtimeSessionController(deps);
  app.get('/api/v1/realtime-sessions', controller.list);
  app.get('/api/v1/realtime-sessions/:id', controller.detail);
  app.post('/api/v1/realtime-sessions/:id/terminate', controller.terminate);
}
