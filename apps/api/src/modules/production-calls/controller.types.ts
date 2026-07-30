import type { FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient, UserRole } from '@sales-ai/database';
import type { ApiEnv } from '@sales-ai/validation';
import type { AuthContext } from '../../types.js';

export type ProductionControllerDependencies = {
  prisma: PrismaClient;
  env: ApiEnv;
  authorize(
    request: FastifyRequest,
    reply: FastifyReply,
    roles: readonly UserRole[],
  ): Promise<AuthContext | undefined>;
  system(request: FastifyRequest, reply: FastifyReply): Promise<AuthContext | undefined>;
  error(reply: FastifyReply, code: number, key: string, message: string): unknown;
  audit(
    prisma: PrismaClient,
    request: FastifyRequest,
    auth: AuthContext,
    organizationId: string,
    action: string,
    entityId: string,
    afterData: unknown,
  ): Promise<void>;
};
