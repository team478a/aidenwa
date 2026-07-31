import type { FastifyReply, FastifyRequest } from 'fastify';
import { agentVersionSchema, idParamsSchema, resourceInputSchema } from '@sales-ai/validation';

import { requestMetadata, writeAudit } from '../../audit.js';
import type { AuthContext } from '../../types.js';
import type { ProductControllerDependencies } from '../products/product.controller.js';
import { aiAgentMutationRoles } from './ai-agent.policy.js';
import { findAiAgent, listAiAgents } from './ai-agent.repository.js';
import {
  archiveAiAgent,
  createAiAgent,
  createAiAgentVersion,
  publishAiAgentVersion,
  updateAiAgent,
} from './ai-agent.service.js';

async function manage(
  deps: ProductControllerDependencies,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const auth = await deps.authorize(request, reply, aiAgentMutationRoles);
  if (!auth || !deps.verifyCsrf(request, reply, auth)) return;
  return auth;
}

async function audit(
  deps: ProductControllerDependencies,
  request: FastifyRequest,
  auth: AuthContext,
  action: string,
  entityType: string,
  id: string,
  afterData?: unknown,
) {
  await writeAudit(deps.prisma, {
    organizationId: auth.organizationId,
    userId: auth.userId,
    action,
    entityType,
    entityId: id,
    afterData,
    ...requestMetadata(request),
  });
}

export function createAiAgentController(deps: ProductControllerDependencies) {
  return {
    list: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await deps.authenticate(request, reply);
      if (!auth) return;
      return { aiAgents: await listAiAgents(deps.prisma, auth.organizationId) };
    },
    create: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await manage(deps, request, reply);
      if (!auth) return;
      const agent = await createAiAgent(
        deps.prisma,
        auth.organizationId,
        auth.userId,
        resourceInputSchema.parse(request.body),
      );
      await audit(deps, request, auth, 'ai_agent.created', 'ai_agent', agent.id, {
        name: agent.name,
      });
      return reply.code(201).send({ aiAgent: agent });
    },
    detail: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await deps.authenticate(request, reply);
      if (!auth) return;
      const { id } = idParamsSchema.parse(request.params);
      const item = await findAiAgent(deps.prisma, auth.organizationId, id);
      return item ? { item } : deps.error(reply, 404, 'NOT_FOUND', '対象が見つかりません');
    },
    update: (request: FastifyRequest, reply: FastifyReply) =>
      mutateAiAgent(deps, request, reply, false),
    archive: (request: FastifyRequest, reply: FastifyReply) =>
      mutateAiAgent(deps, request, reply, true),
    createVersion: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await manage(deps, request, reply);
      if (!auth) return;
      const { id } = idParamsSchema.parse(request.params);
      if (!(await findAiAgent(deps.prisma, auth.organizationId, id)))
        return deps.error(reply, 404, 'NOT_FOUND', 'AI担当者が見つかりません');
      const version = await createAiAgentVersion(
        deps.prisma,
        auth.organizationId,
        auth.userId,
        id,
        agentVersionSchema.parse(request.body),
      );
      await audit(deps, request, auth, 'ai_agent.version_created', 'ai_agent_version', version.id, {
        aiAgentId: id,
        version: version.versionNumber,
      });
      return reply.code(201).send({ aiAgentVersion: version });
    },
    publishVersion: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await manage(deps, request, reply);
      if (!auth) return;
      const { id } = idParamsSchema.parse(request.params);
      const result = await publishAiAgentVersion(deps.prisma, auth.organizationId, auth.userId, id);
      if (!result.count)
        return deps.error(reply, 409, 'IMMUTABLE_OR_MISSING', 'draft版のみ公開できます');
      await audit(deps, request, auth, 'agent.published', 'agent_version', id);
      return { status: 'published' };
    },
  };
}

async function mutateAiAgent(
  deps: ProductControllerDependencies,
  request: FastifyRequest,
  reply: FastifyReply,
  archive: boolean,
) {
  const auth = await manage(deps, request, reply);
  if (!auth) return;
  const { id } = idParamsSchema.parse(request.params);
  const input = resourceInputSchema.partial().parse(request.body ?? {});
  const result = archive
    ? await archiveAiAgent(deps.prisma, auth.organizationId, id)
    : await updateAiAgent(deps.prisma, auth.organizationId, id, input.name);
  if (!result.count) return deps.error(reply, 404, 'NOT_FOUND', '対象が見つかりません');
  await audit(deps, request, auth, `agent.${archive ? 'archived' : 'updated'}`, 'agent', id);
  return { status: archive ? 'archived' : 'updated' };
}
