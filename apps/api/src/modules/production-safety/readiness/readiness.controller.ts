import type { FastifyReply, FastifyRequest } from 'fastify';

import type { ProductControllerDependencies } from '../../products/product.controller.js';
import { readinessReadRoles, resolveReadinessOrganization } from './readiness.policy.js';
import { readProductionReadiness } from './readiness.repository.js';
import { buildProductionReadiness } from './readiness.service.js';

export type ReadinessControllerDependencies = ProductControllerDependencies;

export function createReadinessController(deps: ReadinessControllerDependencies) {
  return {
    read: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await deps.authorize(request, reply, readinessReadRoles);
      if (!auth) return;
      const query = request.query as { organizationId?: string };
      const organizationId = resolveReadinessOrganization(auth, query.organizationId);
      const now = new Date();
      const records = await readProductionReadiness(deps.prisma, organizationId, now);
      return { readiness: buildProductionReadiness(records, now) };
    },
  };
}
