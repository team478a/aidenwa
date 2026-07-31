import type { FastifyReply, FastifyRequest } from 'fastify';
import { type PrismaClient, type UserRole } from '@sales-ai/database';
import { fakeRealtimeSimulationSchema } from '@sales-ai/validation';
import type { ApiEnv } from '@sales-ai/validation';
import type { AuthContext } from '../../../types.js';
import {
  canExposeRealtimeSimulation,
  realtimeSimulationRoles,
} from './realtime-simulation.policy.js';
import { runFakeRealtimeSimulation } from './realtime-simulation.service.js';

export type RealtimeSimulationDependencies = {
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

export function createRealtimeSimulationController(deps: RealtimeSimulationDependencies) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!canExposeRealtimeSimulation(deps.env.NODE_ENV)) return reply.code(404).send();
    const auth = await deps.authorize(request, reply, realtimeSimulationRoles);
    if (!auth || !deps.verifyCsrf(request, reply, auth)) return;
    const parsed = fakeRealtimeSimulationSchema.safeParse(request.body);
    if (!parsed.success) return deps.error(reply, 400, 'VALIDATION_ERROR', parsed.error.message);
    const session = await runFakeRealtimeSimulation(deps.prisma, {
      organizationId: auth.organizationId,
      userId: auth.userId,
      ...parsed.data,
    });
    return reply.code(201).send({ session });
  };
}
