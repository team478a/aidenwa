import type { FastifyReply, FastifyRequest } from 'fastify';
import { policySchema } from '@sales-ai/validation';

import { requestMetadata, writeAudit } from '../../../audit.js';
import type { ProductControllerDependencies } from '../../products/product.controller.js';
import {
  policyAuditProjection,
  productionPolicyMutationRoles,
  productionPolicyReadRoles,
  resolvePolicyOrganization,
} from './production-policy.policy.js';
import { findProductionPolicy } from './production-policy.repository.js';
import { updateProductionPolicy } from './production-policy.service.js';

export type ProductionPolicyControllerDependencies = ProductControllerDependencies;

export function createProductionPolicyController(deps: ProductionPolicyControllerDependencies) {
  return {
    read: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await deps.authorize(request, reply, productionPolicyReadRoles);
      if (!auth) return;
      const query = request.query as { organizationId?: string };
      const organizationId = resolvePolicyOrganization(auth, query.organizationId);
      return { policy: await findProductionPolicy(deps.prisma, organizationId) };
    },
    update: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await deps.authorize(request, reply, productionPolicyMutationRoles);
      if (!auth || !deps.verifyCsrf(request, reply, auth)) return;
      const parsed = policySchema.safeParse(request.body);
      if (!parsed.success) return deps.error(reply, 400, 'VALIDATION_ERROR', parsed.error.message);
      const organizationId = resolvePolicyOrganization(auth, parsed.data.organizationId);
      const policy = await updateProductionPolicy(
        deps.prisma,
        organizationId,
        auth.userId,
        parsed.data,
      );
      await writeAudit(deps.prisma, {
        organizationId,
        userId: auth.userId,
        action: 'production_policy.updated',
        entityType: 'production_call_policy',
        entityId: policy.id,
        afterData: policyAuditProjection(policy),
        ...requestMetadata(request),
      });
      return { policy };
    },
  };
}
