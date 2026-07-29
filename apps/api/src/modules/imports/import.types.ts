import type { FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@sales-ai/database';
import type { AuthContext } from '../../types.js';

export type ImportEnvironment = {
  CSV_MAX_BYTES: number;
  CSV_MAX_ROWS: number;
  IMPORT_RETENTION_HOURS: number;
};

export type ImportRouteDeps = {
  prisma: PrismaClient;
  env: ImportEnvironment;
  authenticate(request: FastifyRequest, reply: FastifyReply): Promise<AuthContext | undefined>;
  mutationAuth(
    request: FastifyRequest,
    reply: FastifyReply,
    roles: Array<'admin' | 'manager' | 'sales'>,
  ): Promise<AuthContext | undefined>;
  error(reply: FastifyReply, code: number, key: string, message: string): unknown;
  audit(
    request: FastifyRequest,
    auth: AuthContext,
    action: string,
    entityType: string,
    entityId: string,
    afterData?: unknown,
  ): Promise<void>;
};

export type ImportReadMode = 'preview' | 'status' | 'errors';
