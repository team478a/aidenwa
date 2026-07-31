import type { FastifyReply, FastifyRequest } from 'fastify';
import { campaignSchema, idParamsSchema } from '@sales-ai/validation';
import { requestMetadata, writeAudit } from '../../audit.js';
import type { AuthContext } from '../../types.js';
import type { ProductControllerDependencies } from '../products/product.controller.js';
import {
  campaignMutationRoles,
  campaignStatusFor,
  canTransitionCampaign,
  type CampaignAction,
} from './campaign.policy.js';
import { campaignReferencesAreValid, findCampaign, listCampaigns } from './campaign.repository.js';
import { createCampaign, transitionCampaign, updateDraftCampaign } from './campaign.service.js';

async function manage(
  deps: ProductControllerDependencies,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const auth = await deps.authorize(request, reply, campaignMutationRoles);
  if (!auth || !deps.verifyCsrf(request, reply, auth)) return;
  return auth;
}

async function audit(
  deps: ProductControllerDependencies,
  request: FastifyRequest,
  auth: AuthContext,
  action: string,
  id: string,
  afterData?: unknown,
) {
  await writeAudit(deps.prisma, {
    organizationId: auth.organizationId,
    userId: auth.userId,
    action,
    entityType: 'campaign',
    entityId: id,
    afterData,
    ...requestMetadata(request),
  });
}

export function createCampaignController(deps: ProductControllerDependencies) {
  const action = (value: CampaignAction) => (request: FastifyRequest, reply: FastifyReply) =>
    runTransition(deps, request, reply, value);
  return {
    list: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await deps.authenticate(request, reply);
      if (!auth) return;
      return { campaigns: await listCampaigns(deps.prisma, auth.organizationId) };
    },
    detail: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await deps.authenticate(request, reply);
      if (!auth) return;
      const { id } = idParamsSchema.parse(request.params);
      const campaign = await findCampaign(
        deps.prisma,
        auth.organizationId,
        id,
        auth.role,
        auth.userId,
      );
      return campaign
        ? { campaign }
        : deps.error(reply, 404, 'NOT_FOUND', 'キャンペーンが見つかりません');
    },
    create: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await manage(deps, request, reply);
      if (!auth) return;
      const input = campaignSchema.parse(request.body);
      if (!(await campaignReferencesAreValid(deps.prisma, auth.organizationId, input)))
        return deps.error(
          reply,
          400,
          'CROSS_OR_UNPUBLISHED',
          '公開済みの同一組織設定を指定してください',
        );
      const campaign = await createCampaign(deps.prisma, auth.organizationId, auth.userId, input);
      await audit(deps, request, auth, 'campaign.created', campaign.id, { name: campaign.name });
      return reply.code(201).send({ campaign });
    },
    update: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await manage(deps, request, reply);
      if (!auth) return;
      const { id } = idParamsSchema.parse(request.params);
      const input = campaignSchema
        .partial()
        .omit({
          productVersionId: true,
          aiAgentVersionId: true,
          scenarioVersionId: true,
          salesListId: true,
        })
        .parse(request.body);
      const result = await updateDraftCampaign(deps.prisma, auth.organizationId, id, input);
      return result.count
        ? { status: 'updated' }
        : deps.error(reply, 409, 'INVALID_STATE', 'draftのみ編集できます');
    },
    validate: action('validate'),
    approve: action('approve'),
    start: action('start'),
    pause: action('pause'),
    resume: action('resume'),
    cancel: action('cancel'),
  };
}

async function runTransition(
  deps: ProductControllerDependencies,
  request: FastifyRequest,
  reply: FastifyReply,
  action: CampaignAction,
) {
  const auth = await manage(deps, request, reply);
  if (!auth) return;
  const { id } = idParamsSchema.parse(request.params);
  const current = await findCampaign(deps.prisma, auth.organizationId, id);
  if (!current) return deps.error(reply, 404, 'NOT_FOUND', 'キャンペーンが見つかりません');
  if (!canTransitionCampaign(action, current.status))
    return deps.error(reply, 409, 'INVALID_STATE', '状態遷移が不正です');
  if ((action === 'start' || action === 'resume') && !current.approvedAt)
    return deps.error(reply, 409, 'APPROVAL_REQUIRED', '開始前に承認が必要です');
  if (action === 'validate') {
    const [references, eligible] = await Promise.all([
      campaignReferencesAreValid(deps.prisma, auth.organizationId, current),
      deps.prisma.campaignTarget.count({
        where: { campaignId: id, eligibilityStatus: 'eligible' },
      }),
    ]);
    if (!references || !eligible)
      return deps.error(reply, 409, 'VALIDATION_FAILED', '公開設定と適格対象が必要です');
  }
  const campaign = await transitionCampaign(deps.prisma, id, auth.userId, action);
  await audit(deps, request, auth, `campaign.${action}`, id, {
    from: current.status,
    to: campaignStatusFor(action),
  });
  return { campaign };
}
