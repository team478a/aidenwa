import type { FastifyReply, FastifyRequest } from 'fastify';
import { evaluateProductionGate } from '@sales-ai/database';
import { gateInputSchema } from '@sales-ai/validation';
import { requestMetadata, writeAudit } from '../../../audit.js';
import type { ProductControllerDependencies } from '../../products/product.controller.js';
import { gateRoles, resolveGateOrganization } from './gate-decision.policy.js';

export function createGateDecisionController(deps: ProductControllerDependencies) {
  return {
    evaluate: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await deps.authorize(request, reply, gateRoles);
      if (!auth || !deps.verifyCsrf(request, reply, auth)) return;
      const parsed = gateInputSchema.safeParse(request.body);
      if (!parsed.success) return deps.error(reply, 400, 'VALIDATION_ERROR', parsed.error.message);
      const organizationId = resolveGateOrganization(auth, parsed.data.organizationId);
      const decision = await evaluateProductionGate(deps.prisma, {
        ...parsed.data,
        organizationId,
      });
      const record = await deps.prisma.productionGateDecision.create({
        data: {
          organizationId,
          campaignId: parsed.data.campaignId,
          companyId: parsed.data.companyId,
          phoneNumberId: parsed.data.phoneNumberId,
          provider: parsed.data.provider,
          allowed: decision.allowed,
          reasonCodes: decision.reasonCodes,
        },
      });
      if (!decision.allowed)
        await writeAudit(deps.prisma, {
          organizationId,
          userId: auth.userId,
          action: 'production_gate.rejected',
          entityType: 'production_gate_decision',
          entityId: record.id,
          afterData: { reasonCodes: decision.reasonCodes, provider: parsed.data.provider },
          ...requestMetadata(request),
        });
      return { decision: { id: record.id, ...decision } };
    },
    usage: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await deps.authorize(request, reply, gateRoles);
      if (!auth) return;
      const query = request.query as { organizationId?: string };
      const organizationId = resolveGateOrganization(auth, query.organizationId);
      const [usage, budgets, rejections] = await Promise.all([
        deps.prisma.callUsageCounter.findMany({
          where: { organizationId },
          orderBy: { periodStart: 'desc' },
          take: 20,
        }),
        deps.prisma.callBudgetCounter.findMany({
          where: { organizationId },
          orderBy: { periodStart: 'desc' },
          take: 20,
        }),
        deps.prisma.productionGateDecision.findMany({
          where: { organizationId, allowed: false },
          orderBy: { evaluatedAt: 'desc' },
          take: 50,
        }),
      ]);
      return { usage, budgets, rejections };
    },
  };
}
