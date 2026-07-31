import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  graphSchema,
  idParamsSchema,
  resourceInputSchema,
  simulateSchema,
} from '@sales-ai/validation';

import { requestMetadata, writeAudit } from '../../audit.js';
import type { AuthContext } from '../../types.js';
import type { ProductControllerDependencies } from '../products/product.controller.js';
import { scenarioMutationRoles } from './scenario.policy.js';
import { findScenario, findScenarioVersion, listScenarios } from './scenario.repository.js';
import {
  createScenario,
  createScenarioVersion,
  evaluateScenario,
  recordScenarioAction,
  saveScenarioGraph,
  updateScenario,
} from './scenario.service.js';

async function manage(
  deps: ProductControllerDependencies,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const auth = await deps.authorize(request, reply, scenarioMutationRoles);
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

export function createScenarioController(deps: ProductControllerDependencies) {
  return {
    list: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await deps.authenticate(request, reply);
      if (!auth) return;
      return { scenarios: await listScenarios(deps.prisma, auth.organizationId) };
    },
    create: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await manage(deps, request, reply);
      if (!auth) return;
      const scenario = await createScenario(
        deps.prisma,
        auth.organizationId,
        auth.userId,
        resourceInputSchema.parse(request.body),
      );
      await audit(deps, request, auth, 'scenario.created', 'scenario', scenario.id, {
        name: scenario.name,
      });
      return reply.code(201).send({ scenario });
    },
    detail: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await deps.authenticate(request, reply);
      if (!auth) return;
      const { id } = idParamsSchema.parse(request.params);
      const item = await findScenario(deps.prisma, auth.organizationId, id);
      return item ? { item } : deps.error(reply, 404, 'NOT_FOUND', '対象が見つかりません');
    },
    update: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await manage(deps, request, reply);
      if (!auth) return;
      const { id } = idParamsSchema.parse(request.params);
      const input = resourceInputSchema.partial().parse(request.body ?? {});
      const result = await updateScenario(deps.prisma, auth.organizationId, id, input.name);
      if (!result.count) return deps.error(reply, 404, 'NOT_FOUND', '対象が見つかりません');
      await audit(deps, request, auth, 'scenario.updated', 'scenario', id);
      return { status: 'updated' };
    },
    createVersion: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await manage(deps, request, reply);
      if (!auth) return;
      const { id } = idParamsSchema.parse(request.params);
      if (!(await findScenario(deps.prisma, auth.organizationId, id)))
        return deps.error(reply, 404, 'NOT_FOUND', 'シナリオが見つかりません');
      const version = await createScenarioVersion(
        deps.prisma,
        auth.organizationId,
        auth.userId,
        id,
      );
      return reply.code(201).send({ scenarioVersion: version });
    },
    saveGraph: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await manage(deps, request, reply);
      if (!auth) return;
      const { id } = idParamsSchema.parse(request.params);
      const saved = await saveScenarioGraph(
        deps.prisma,
        auth.organizationId,
        id,
        graphSchema.parse(request.body),
      );
      return saved
        ? { status: 'saved' }
        : deps.error(reply, 409, 'IMMUTABLE_OR_MISSING', 'draft版のみ編集できます');
    },
    validate: (request: FastifyRequest, reply: FastifyReply) =>
      scenarioAction(deps, request, reply, 'validate'),
    publish: (request: FastifyRequest, reply: FastifyReply) =>
      scenarioAction(deps, request, reply, 'publish'),
    simulate: (request: FastifyRequest, reply: FastifyReply) =>
      scenarioAction(deps, request, reply, 'simulate'),
  };
}

async function scenarioAction(
  deps: ProductControllerDependencies,
  request: FastifyRequest,
  reply: FastifyReply,
  action: 'validate' | 'publish' | 'simulate',
) {
  const auth =
    action === 'simulate'
      ? await deps.authenticate(request, reply)
      : await manage(deps, request, reply);
  if (!auth) return;
  const { id } = idParamsSchema.parse(request.params);
  const version = await findScenarioVersion(deps.prisma, auth.organizationId, id);
  if (!version) return deps.error(reply, 404, 'NOT_FOUND', '版が見つかりません');
  const intents = action === 'simulate' ? simulateSchema.parse(request.body).intents : undefined;
  const { errors, simulation } = evaluateScenario(version.nodes, version.edges, intents);
  if (action === 'simulate')
    return errors.length
      ? deps.error(reply, 409, 'INVALID_SCENARIO', '検証エラーがあります')
      : simulation;
  await recordScenarioAction(deps.prisma, id, auth.userId, action, errors);
  await audit(deps, request, auth, `scenario.${action}`, 'scenario_version', id, { errors });
  if (action === 'publish' && errors.length)
    return deps.error(reply, 409, 'INVALID_SCENARIO', '検証エラーがあります');
  return { valid: !errors.length, errors, status: action === 'publish' ? 'published' : undefined };
}
