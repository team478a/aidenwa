import type { FastifyInstance } from 'fastify';
import {
  createRealtimeSimulationController,
  type RealtimeSimulationDependencies,
} from './realtime-simulation.controller.js';

export function registerRealtimeSimulationRoutes(
  app: FastifyInstance,
  deps: RealtimeSimulationDependencies,
) {
  app.post('/api/v1/realtime-simulations', createRealtimeSimulationController(deps));
}
