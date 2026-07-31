import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient, UserRole } from '@sales-ai/database';
import type { ApiEnv } from '@sales-ai/validation';
import { registerHandoffRoutes } from './modules/handoffs/handoff.routes.js';
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

export function registerStage4DRoutes(app: FastifyInstance, deps: Deps) {
  registerHandoffRoutes(app, deps);
}
