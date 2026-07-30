import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { UserRole, type PrismaClient } from '@sales-ai/database';
import type { ApiEnv } from '@sales-ai/validation';
import { requestMetadata, writeAudit } from './audit.js';
import type { AuthContext } from './types.js';
import { registerAuthorizationRoutes } from './modules/production-calls/authorization.controller.js';
import type { ProductionControllerDependencies } from './modules/production-calls/controller.types.js';
import { registerProductionIncidentRoutes } from './modules/production-calls/incident.controller.js';
import { crossedBudgetThresholds } from './modules/production-calls/production-call.policy.js';
import { registerRealCallRoutes } from './modules/production-calls/real-call.controller.js';
import { registerSourceNumberRoutes } from './modules/production-calls/source-number.controller.js';
import { createTwilioWebhookHandler } from './modules/production-calls/twilio-webhook.service.js';

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

export function registerStage4BRoutes(app: FastifyInstance, deps: Deps) {
  const { prisma, env } = deps;
  const system = async (request: FastifyRequest, reply: FastifyReply) => {
    const auth = await deps.authorize(request, reply, [UserRole.system_admin]);
    if (!auth || !deps.verifyCsrf(request, reply, auth)) return;
    return auth;
  };
  const controllerDeps: ProductionControllerDependencies = {
    prisma,
    env,
    authorize: (request, reply, roles) => deps.authorize(request, reply, roles),
    system,
    error: (reply, code, key, message) => deps.error(reply, code, key, message),
    audit,
  };
  registerSourceNumberRoutes(app, controllerDeps);
  registerProductionIncidentRoutes(app, controllerDeps);
  registerAuthorizationRoutes(app, controllerDeps);
  registerRealCallRoutes(app, controllerDeps);
  const twilioHandler = createTwilioWebhookHandler({
    prisma,
    env,
    error: (reply, code, key, message) => deps.error(reply, code, key, message),
  });
  app.post('/api/v1/twilio/twiml/:executionId', twilioHandler('twiml'));
  app.post('/api/v1/twilio/dtmf/:executionId', twilioHandler('dtmf'));
  app.post('/api/v1/twilio/status/:executionId', twilioHandler('status'));
}

export { crossedBudgetThresholds };

async function audit(
  prisma: PrismaClient,
  request: FastifyRequest,
  auth: AuthContext,
  organizationId: string,
  action: string,
  entityId: string,
  afterData: unknown,
) {
  await writeAudit(prisma, {
    organizationId,
    userId: auth.userId,
    action,
    entityType: 'stage4b1',
    entityId,
    afterData,
    ...requestMetadata(request),
  });
}
