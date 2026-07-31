import type { FastifyInstance } from 'fastify';
import type { ProductControllerDependencies } from './modules/products/product.controller.js';
import { registerAllowlistRoutes } from './modules/production-safety/allowlist/allowlist.routes.js';
import { registerApprovalRoutes } from './modules/production-safety/approval/approval.routes.js';
import { registerEmergencyStopRoutes } from './modules/production-safety/emergency-stop/emergency-stop.routes.js';
import { registerGateDecisionRoutes } from './modules/production-safety/gate-decision/gate-decision.routes.js';
import { registerMockWebhookRoutes } from './modules/production-safety/mock-webhook/mock-webhook.routes.js';
import { registerProductionPolicyRoutes } from './modules/production-safety/policy/production-policy.routes.js';
import { registerProviderConfigurationRoutes } from './modules/production-safety/provider-configuration/provider-configuration.routes.js';
import { registerReadinessRoutes } from './modules/production-safety/readiness/readiness.routes.js';

type Deps = ProductControllerDependencies & {
  webhookSecret: string;
  redisUrl: string;
};

export function registerStage4Routes(app: FastifyInstance, deps: Deps) {
  registerReadinessRoutes(app, deps);
  registerApprovalRoutes(app, deps);
  registerProductionPolicyRoutes(app, deps);
  registerEmergencyStopRoutes(app, deps);
  registerAllowlistRoutes(app, deps);
  registerProviderConfigurationRoutes(app, deps);
  registerGateDecisionRoutes(app, deps);
  registerMockWebhookRoutes(app, deps);
}
