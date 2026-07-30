import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import multipart from '@fastify/multipart';
import { type PrismaClient, UserRole } from '@sales-ai/database';

import type { AuthContext } from './types.js';
import { registerCompanyRoutes } from './modules/companies/company.routes.js';
import { registerContactRoutes } from './modules/contacts/contact.routes.js';
import { registerImportRoutes } from './modules/imports/import.routes.js';
import { registerOptOutRoutes } from './modules/opt-outs/opt-out.routes.js';
import { registerPhoneNumberRoutes } from './modules/phone-numbers/phone-number.routes.js';
import { registerSalesListRoutes } from './modules/sales-lists/sales-list.routes.js';
import { registerTagRoutes } from './modules/tags/tag.routes.js';
import { requestMetadata, writeAudit } from './audit.js';

type Deps = {
  prisma: PrismaClient;
  env: {
    REDIS_URL: string;
    CSV_MAX_BYTES: number;
    CSV_MAX_ROWS: number;
    IMPORT_RETENTION_HOURS: number;
    BULK_OPERATION_LIMIT: number;
  };
  authenticate(request: FastifyRequest, reply: FastifyReply): Promise<AuthContext | undefined>;
  authorize(
    request: FastifyRequest,
    reply: FastifyReply,
    roles: readonly UserRole[],
  ): Promise<AuthContext | undefined>;
  verifyCsrf(request: FastifyRequest, reply: FastifyReply, auth: AuthContext): boolean;
  error(reply: FastifyReply, code: number, key: string, message: string): unknown;
};

export function registerStage2Routes(app: FastifyInstance, deps: Deps) {
  void app.register(multipart, { limits: { fileSize: deps.env.CSV_MAX_BYTES, files: 1 } });
  const mutationAuth = async (request: FastifyRequest, reply: FastifyReply) => {
    const auth = await deps.authorize(request, reply, [
      UserRole.admin,
      UserRole.manager,
      UserRole.sales,
    ]);
    if (!auth || !deps.verifyCsrf(request, reply, auth)) return;
    return auth;
  };
  registerImportRoutes(app, {
    prisma: deps.prisma,
    env: deps.env,
    authenticate: (request, reply) => deps.authenticate(request, reply),
    mutationAuth,
    error: (reply, code, key, message) => deps.error(reply, code, key, message),
    audit: async (request, auth, action, entityType, entityId, afterData) =>
      writeAudit(deps.prisma, {
        organizationId: auth.organizationId,
        userId: auth.userId,
        action,
        entityType,
        entityId,
        afterData,
        ...requestMetadata(request),
      }),
  });
  registerCompanyRoutes(app, deps);
  registerContactRoutes(app, deps);
  registerPhoneNumberRoutes(app, deps);
  registerTagRoutes(app, deps);
  registerSalesListRoutes(app, {
    ...deps,
    bulkOperationLimit: deps.env.BULK_OPERATION_LIMIT,
  });
  registerOptOutRoutes(app, deps);
}
