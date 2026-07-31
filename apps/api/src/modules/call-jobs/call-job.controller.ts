import type { FastifyReply, FastifyRequest } from 'fastify';
import { UserRole } from '@sales-ai/database';
import { fixtureSchema, idParamsSchema } from '@sales-ai/validation';

import { requestMetadata, writeAudit } from '../../audit.js';
import type { AuthContext } from '../../types.js';
import type { ProductControllerDependencies } from '../products/product.controller.js';
import { callJobMutationRoles, canUseMockCallFixture } from './call-job.policy.js';
import {
  findCallAttempt,
  findCallJob,
  findNextEligibleTarget,
  findRunningCampaign,
  listCallJobs,
} from './call-job.repository.js';
import { cancelCallJob, queueMockCall, updateManualOutcome } from './call-job.service.js';

export type CallJobControllerDependencies = ProductControllerDependencies & { nodeEnv: string };

async function manage(
  deps: CallJobControllerDependencies,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const auth = await deps.authorize(request, reply, callJobMutationRoles);
  if (!auth || !deps.verifyCsrf(request, reply, auth)) return;
  return auth;
}

async function audit(
  deps: CallJobControllerDependencies,
  request: FastifyRequest,
  auth: AuthContext,
  action: string,
  entityType: string,
  entityId: string,
  afterData?: unknown,
) {
  await writeAudit(deps.prisma, {
    organizationId: auth.organizationId,
    userId: auth.userId,
    action,
    entityType,
    entityId,
    afterData,
    ...requestMetadata(request),
  });
}

function ownerScope(auth: AuthContext) {
  return auth.role === UserRole.sales ? auth.userId : undefined;
}

export function createCallJobController(deps: CallJobControllerDependencies) {
  return {
    runNext: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await manage(deps, request, reply);
      if (!auth) return;
      if (!canUseMockCallFixture(deps.nodeEnv))
        return deps.error(reply, 403, 'MOCK_DISABLED', 'productionではfixture指定できません');
      const { id } = idParamsSchema.parse(request.params);
      const { fixture } = fixtureSchema.parse(request.body ?? {});
      if (!(await findRunningCampaign(deps.prisma, auth.organizationId, id)))
        return deps.error(reply, 409, 'NOT_RUNNING', 'runningキャンペーンのみ実行できます');
      const target = await findNextEligibleTarget(deps.prisma, auth.organizationId, id);
      if (!target) return deps.error(reply, 409, 'NO_TARGET', '実行対象がありません');
      const result = await queueMockCall(deps.prisma, {
        organizationId: auth.organizationId,
        campaignId: id,
        target,
        fixture,
      });
      if (!result.job) return { dispatched: false, exclusionReason: result.exclusionReason };
      await audit(deps, request, auth, 'mock_call.queued', 'call_job', result.job.id, {
        campaignId: id,
        targetId: target.id,
        fixture,
      });
      return reply.code(202).send({ callJob: result.job });
    },
    list: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await deps.authenticate(request, reply);
      if (!auth) return;
      return {
        callJobs: await listCallJobs(deps.prisma, auth.organizationId, ownerScope(auth)),
      };
    },
    detail: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await deps.authenticate(request, reply);
      if (!auth) return;
      const { id } = idParamsSchema.parse(request.params);
      const callJob = await findCallJob(deps.prisma, auth.organizationId, id, ownerScope(auth));
      return callJob ? { callJob } : deps.error(reply, 404, 'NOT_FOUND', 'ジョブが見つかりません');
    },
    cancel: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await manage(deps, request, reply);
      if (!auth) return;
      const { id } = idParamsSchema.parse(request.params);
      const result = await cancelCallJob(deps.prisma, auth.organizationId, id);
      if (!result.count) return deps.error(reply, 409, 'INVALID_STATE', '取消できません');
      await audit(deps, request, auth, 'mock_call.cancelled', 'call_job', id);
      return { status: 'cancelled' };
    },
    attemptDetail: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await deps.authenticate(request, reply);
      if (!auth) return;
      const { id } = idParamsSchema.parse(request.params);
      const callAttempt = await findCallAttempt(
        deps.prisma,
        auth.organizationId,
        id,
        ownerScope(auth),
      );
      return callAttempt
        ? { callAttempt }
        : deps.error(reply, 404, 'NOT_FOUND', '試行が見つかりません');
    },
    updateOutcome: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await deps.authenticate(request, reply);
      if (!auth || !deps.verifyCsrf(request, reply, auth)) return;
      const { id } = idParamsSchema.parse(request.params);
      const { fixture } = fixtureSchema.parse(request.body);
      if (!(await findCallAttempt(deps.prisma, auth.organizationId, id, ownerScope(auth))))
        return deps.error(reply, 404, 'NOT_FOUND', '試行が見つかりません');
      await updateManualOutcome(deps.prisma, id, fixture);
      await audit(deps, request, auth, 'mock_call.manual_outcome', 'call_attempt', id, {
        resultCode: fixture,
      });
      return { status: 'updated' };
    },
  };
}
