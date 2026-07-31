import type { FastifyInstance } from 'fastify';

import { registerAiAgentRoutes } from './modules/ai-agents/ai-agent.routes.js';
import { registerCallJobRoutes } from './modules/call-jobs/call-job.routes.js';
import { registerCampaignTargetRoutes } from './modules/campaign-targets/campaign-target.routes.js';
import { registerCampaignRoutes } from './modules/campaigns/campaign.routes.js';
import { registerKnowledgeRoutes } from './modules/knowledge/knowledge.routes.js';
import type { ProductControllerDependencies } from './modules/products/product.controller.js';
import { registerProductRoutes } from './modules/products/product.routes.js';
import { registerScenarioRoutes } from './modules/scenarios/scenario.routes.js';

type Deps = ProductControllerDependencies & {
  redisUrl: string;
  nodeEnv: string;
};

export function registerStage3Routes(app: FastifyInstance, deps: Deps) {
  registerProductRoutes(app, deps);
  registerAiAgentRoutes(app, deps);
  registerScenarioRoutes(app, deps);
  registerKnowledgeRoutes(app, deps);
  registerCampaignRoutes(app, deps);
  registerCampaignTargetRoutes(app, deps);
  registerCallJobRoutes(app, deps);
}
