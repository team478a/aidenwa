import type { FastifyInstance } from 'fastify';

import {
  createApprovalController,
  type ApprovalControllerDependencies,
} from './approval.controller.js';

export function registerApprovalRoutes(app: FastifyInstance, deps: ApprovalControllerDependencies) {
  const controller = createApprovalController(deps);
  app.get('/api/v1/production-approvals', controller.list);
  app.post('/api/v1/production-approvals', controller.create);
  app.patch('/api/v1/production-approvals/:id', controller.update);
  app.post('/api/v1/production-approvals/:id/submit', controller.submit);
  for (const decision of ['approve', 'reject', 'suspend', 'resume'] as const)
    app.post(`/api/v1/production-approvals/:id/${decision}`, controller.decide(decision));
}
