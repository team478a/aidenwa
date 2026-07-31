import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { UserRole, PrismaClient } from '@sales-ai/database';
import type { ApiEnv } from '@sales-ai/validation';
import { registerFollowupRoutes } from './modules/followups/followup.routes.js';
import { registerZoomPhoneRoutes } from './modules/followups/zoom-sync/zoom-phone.routes.js';
import { registerRealtimeSessionRoutes } from './modules/realtime/realtime-session/realtime-session.routes.js';
import { registerRealtimeSimulationRoutes } from './modules/realtime/realtime-simulation/realtime-simulation.routes.js';
import type { AuthContext } from './types.js';

type Deps = {
  prisma: PrismaClient;
  env: ApiEnv;
  authorize(
    request: FastifyRequest,
    reply: FastifyReply,
    roles: readonly UserRole[],
  ): Promise<AuthContext | undefined>;
  verifyCsrf(request: FastifyRequest, reply: FastifyReply, auth: AuthContext): boolean;
  error(reply: FastifyReply, code: number, key: string, message: string): unknown;
};

export function registerStage4B2Routes(app: FastifyInstance, deps: Deps) {
  registerRealtimeSessionRoutes(app, deps);
  registerRealtimeSimulationRoutes(app, deps);
  registerFollowupRoutes(app, deps);
  registerZoomPhoneRoutes(app, deps);
}
