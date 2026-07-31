import type { FastifyReply, FastifyRequest } from 'fastify';
import { approvalInputSchema, reasonSchema } from '@sales-ai/validation';

import { requestMetadata, writeAudit } from '../../../audit.js';
import type { AuthContext } from '../../../types.js';
import type { ProductControllerDependencies } from '../../products/product.controller.js';
import {
  approvalDecisionRoles,
  approvalDecisionStatus,
  approvalEditRoles,
  approvalReadRoles,
  resolveApprovalOrganization,
  type ApprovalDecision,
} from './approval.policy.js';
import {
  countScopedProducts,
  findApproval,
  findEditableApproval,
  findSubmittableApproval,
  listApprovals,
} from './approval.repository.js';
import {
  createApproval,
  decideApproval,
  decisionError,
  submitApproval,
  updateApproval,
} from './approval.service.js';

export type ApprovalControllerDependencies = ProductControllerDependencies;

async function mutate(
  deps: ApprovalControllerDependencies,
  request: FastifyRequest,
  reply: FastifyReply,
  decisionOnly = false,
) {
  const auth = await deps.authorize(
    request,
    reply,
    decisionOnly ? approvalDecisionRoles : approvalEditRoles,
  );
  if (!auth || !deps.verifyCsrf(request, reply, auth)) return;
  return auth;
}

async function audit(
  deps: ApprovalControllerDependencies,
  request: FastifyRequest,
  auth: AuthContext,
  organizationId: string,
  action: string,
  id: string,
  afterData?: unknown,
  beforeData?: unknown,
) {
  await writeAudit(deps.prisma, {
    organizationId,
    userId: auth.userId,
    action,
    entityType: 'production_call_approval',
    entityId: id,
    afterData,
    beforeData,
    ...requestMetadata(request),
  });
}

export function createApprovalController(deps: ApprovalControllerDependencies) {
  return {
    list: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await deps.authorize(request, reply, approvalReadRoles);
      if (!auth) return;
      const query = request.query as { organizationId?: string };
      const organizationId = resolveApprovalOrganization(auth, query.organizationId);
      return { approvals: await listApprovals(deps.prisma, organizationId) };
    },
    create: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await mutate(deps, request, reply);
      if (!auth) return;
      const parsed = approvalInputSchema.safeParse(request.body);
      if (!parsed.success) return deps.error(reply, 400, 'VALIDATION_ERROR', parsed.error.message);
      const organizationId = resolveApprovalOrganization(auth, parsed.data.organizationId);
      const count = await countScopedProducts(deps.prisma, organizationId, parsed.data.productIds);
      if (count !== parsed.data.productIds.length)
        return deps.error(
          reply,
          400,
          'PRODUCT_SCOPE_INVALID',
          '承認対象商材が組織内に存在しません',
        );
      const approval = await createApproval(deps.prisma, organizationId, auth.userId, parsed.data);
      await audit(deps, request, auth, organizationId, 'production_approval.created', approval.id, {
        status: approval.status,
        targetRegions: approval.targetRegions,
        productIds: approval.productIds,
      });
      return reply.code(201).send({ approval });
    },
    update: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await mutate(deps, request, reply);
      if (!auth) return;
      const parsed = approvalInputSchema.safeParse(request.body);
      if (!parsed.success) return deps.error(reply, 400, 'VALIDATION_ERROR', parsed.error.message);
      const organizationId = resolveApprovalOrganization(auth, parsed.data.organizationId);
      const id = (request.params as { id: string }).id;
      const before = await findEditableApproval(deps.prisma, organizationId, id);
      if (!before) return deps.error(reply, 404, 'NOT_FOUND', '編集可能な承認情報がありません');
      const approval = await updateApproval(deps.prisma, organizationId, id, parsed.data);
      await audit(
        deps,
        request,
        auth,
        organizationId,
        'production_approval.updated',
        id,
        { status: approval.status },
        { status: before.status },
      );
      return { approval };
    },
    submit: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await mutate(deps, request, reply);
      if (!auth) return;
      const id = (request.params as { id: string }).id;
      if (!(await findSubmittableApproval(deps.prisma, auth.organizationId, id)))
        return deps.error(reply, 404, 'NOT_FOUND', '申請可能な承認情報がありません');
      const approval = await submitApproval(deps.prisma, id, auth.userId);
      await audit(deps, request, auth, auth.organizationId, 'production_approval.submitted', id, {
        status: approval.status,
      });
      return { approval };
    },
    decide:
      (decision: ApprovalDecision) => async (request: FastifyRequest, reply: FastifyReply) => {
        const auth = await mutate(deps, request, reply, true);
        if (!auth) return;
        const parsed = reasonSchema.safeParse(request.body);
        if (!parsed.success) return deps.error(reply, 400, 'REASON_REQUIRED', '理由が必要です');
        const id = (request.params as { id: string }).id;
        const before = await findApproval(deps.prisma, id);
        if (!before) return deps.error(reply, 404, 'NOT_FOUND', '承認情報がありません');
        const invalid = decisionError(before, decision, new Date());
        if (invalid === 'INVALID_TRANSITION')
          return deps.error(reply, 409, invalid, '承認状態遷移が不正です');
        if (invalid === 'APPROVAL_INCOMPLETE')
          return deps.error(reply, 409, invalid, '承認期限が不正です');
        const approval = await decideApproval(
          deps.prisma,
          id,
          auth.userId,
          decision,
          parsed.data.reason,
        );
        await audit(
          deps,
          request,
          auth,
          before.organizationId,
          `production_approval.${decision === 'approve' ? 'approved' : decision === 'resume' ? 'resumed' : `${decision}ed`}`,
          id,
          { status: approvalDecisionStatus[decision], reason: parsed.data.reason },
          { status: before.status },
        );
        return { approval };
      },
  };
}
