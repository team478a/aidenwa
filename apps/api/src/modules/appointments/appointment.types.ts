import type { FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient, UserRole } from '@sales-ai/database';
import type { ApiEnv } from '@sales-ai/validation';
import type { AuthContext } from '../../types.js';

export type AppointmentRouteDependencies = {
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
