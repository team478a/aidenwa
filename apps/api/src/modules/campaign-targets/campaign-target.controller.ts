import type { FastifyReply, FastifyRequest } from 'fastify';
import { idParamsSchema } from '@sales-ai/validation';
import { requestMetadata, writeAudit } from '../../audit.js';
import type { ProductControllerDependencies } from '../products/product.controller.js';
import { campaignTargetMutationRoles } from './campaign-target.policy.js';
import { findDraftCampaign, listCampaignTargets } from './campaign-target.repository.js';
import {
  materializeCampaignTargets,
  previewCampaignTargets,
  summarizeCampaignTargets,
} from './campaign-target.service.js';

async function manage(
  deps: ProductControllerDependencies,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const auth = await deps.authorize(request, reply, campaignTargetMutationRoles);
  if (!auth || !deps.verifyCsrf(request, reply, auth)) return;
  return auth;
}

export function createCampaignTargetController(deps: ProductControllerDependencies) {
  return {
    list: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await deps.authenticate(request, reply);
      if (!auth) return;
      const { id } = idParamsSchema.parse(request.params);
      return {
        targets: await listCampaignTargets(
          deps.prisma,
          auth.organizationId,
          id,
          auth.role,
          auth.userId,
        ),
      };
    },
    preview: (request: FastifyRequest, reply: FastifyReply) =>
      prepareTargets(deps, request, reply, false),
    materialize: (request: FastifyRequest, reply: FastifyReply) =>
      prepareTargets(deps, request, reply, true),
  };
}

async function prepareTargets(
  deps: ProductControllerDependencies,
  request: FastifyRequest,
  reply: FastifyReply,
  materialize: boolean,
) {
  const auth = await manage(deps, request, reply);
  if (!auth) return;
  const { id } = idParamsSchema.parse(request.params);
  const campaign = await findDraftCampaign(deps.prisma, auth.organizationId, id);
  if (!campaign) return deps.error(reply, 409, 'INVALID_STATE', 'draftのみ対象化できます');
  const rows = await previewCampaignTargets(deps.prisma, auth.organizationId, campaign.salesListId);
  const summary = summarizeCampaignTargets(rows);
  if (materialize) {
    await materializeCampaignTargets(deps.prisma, auth.organizationId, id, rows);
    await writeAudit(deps.prisma, {
      organizationId: auth.organizationId,
      userId: auth.userId,
      action: 'campaign.targets_materialized',
      entityType: 'campaign',
      entityId: id,
      afterData: summary,
      ...requestMetadata(request),
    });
  }
  return { targets: rows, summary };
}
