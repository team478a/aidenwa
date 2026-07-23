import type { PrismaClient, UserRole } from '@sales-ai/database';

export type AuthContext = {
  sessionId: string;
  organizationId: string;
  userId: string;
  role: UserRole;
  csrfTokenHash: string;
};
export type AppOptions = { prisma?: PrismaClient };
export type AuditInput = {
  organizationId?: string | undefined;
  userId?: string | undefined;
  action: string;
  entityType: string;
  entityId?: string | undefined;
  beforeData?: unknown;
  afterData?: unknown;
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
};

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AuthContext;
  }
}
