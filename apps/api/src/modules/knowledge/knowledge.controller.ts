import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  documentSchema,
  entrySchema,
  idParamsSchema,
  resourceInputSchema,
  searchSchema,
} from '@sales-ai/validation';
import { requestMetadata, writeAudit } from '../../audit.js';
import type { AuthContext } from '../../types.js';
import type { ProductControllerDependencies } from '../products/product.controller.js';
import { knowledgeMutationRoles } from './knowledge.policy.js';
import {
  findDraftDocument,
  findDraftEntry,
  findKnowledgeBase,
  listKnowledgeBases,
  searchKnowledge,
} from './knowledge.repository.js';
import {
  createKnowledgeBase,
  createKnowledgeDocument,
  createKnowledgeEntry,
  publishKnowledgeDocument,
  updateKnowledgeBase,
  updateKnowledgeDocument,
  updateKnowledgeEntry,
} from './knowledge.service.js';

async function manage(
  deps: ProductControllerDependencies,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const auth = await deps.authorize(request, reply, knowledgeMutationRoles);
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

export function createKnowledgeController(deps: ProductControllerDependencies) {
  return {
    list: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await deps.authenticate(request, reply);
      if (!auth) return;
      return { knowledgeBases: await listKnowledgeBases(deps.prisma, auth.organizationId) };
    },
    create: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await manage(deps, request, reply);
      if (!auth) return;
      const item = await createKnowledgeBase(
        deps.prisma,
        auth.organizationId,
        auth.userId,
        resourceInputSchema.parse(request.body),
      );
      await audit(deps, request, auth, 'knowledge_base.created', 'knowledge_base', item.id, {
        name: item.name,
      });
      return reply.code(201).send({ knowledgeBase: item });
    },
    detail: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await deps.authenticate(request, reply);
      if (!auth) return;
      const { id } = idParamsSchema.parse(request.params);
      const item = await findKnowledgeBase(deps.prisma, auth.organizationId, id);
      return item ? { item } : deps.error(reply, 404, 'NOT_FOUND', '対象が見つかりません');
    },
    update: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await manage(deps, request, reply);
      if (!auth) return;
      const { id } = idParamsSchema.parse(request.params);
      const input = resourceInputSchema.partial().parse(request.body ?? {});
      const result = await updateKnowledgeBase(deps.prisma, auth.organizationId, id, input.name);
      if (!result.count) return deps.error(reply, 404, 'NOT_FOUND', '対象が見つかりません');
      await audit(deps, request, auth, 'knowledge.updated', 'knowledge', id);
      return { status: 'updated' };
    },
    createDocument: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await manage(deps, request, reply);
      if (!auth) return;
      const { id } = idParamsSchema.parse(request.params);
      if (!(await findKnowledgeBase(deps.prisma, auth.organizationId, id)))
        return deps.error(reply, 404, 'NOT_FOUND', 'ナレッジが見つかりません');
      const document = await createKnowledgeDocument(
        deps.prisma,
        auth.organizationId,
        auth.userId,
        id,
        documentSchema.parse(request.body),
      );
      return reply.code(201).send({ knowledgeDocument: document });
    },
    createEntry: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await manage(deps, request, reply);
      if (!auth) return;
      const { id } = idParamsSchema.parse(request.params);
      if (!(await findDraftDocument(deps.prisma, auth.organizationId, id)))
        return deps.error(reply, 409, 'IMMUTABLE_OR_MISSING', 'draft文書のみ編集できます');
      const entry = await createKnowledgeEntry(
        deps.prisma,
        auth.organizationId,
        id,
        entrySchema.parse(request.body),
      );
      return reply.code(201).send({ knowledgeEntry: entry });
    },
    updateDocument: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await manage(deps, request, reply);
      if (!auth) return;
      const { id } = idParamsSchema.parse(request.params);
      const result = await updateKnowledgeDocument(
        deps.prisma,
        auth.organizationId,
        id,
        documentSchema.partial().parse(request.body),
      );
      return result.count
        ? { status: 'updated' }
        : deps.error(reply, 409, 'IMMUTABLE_OR_MISSING', 'draft文書のみ編集できます');
    },
    updateEntry: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await manage(deps, request, reply);
      if (!auth) return;
      const { id } = idParamsSchema.parse(request.params);
      if (!(await findDraftEntry(deps.prisma, auth.organizationId, id)))
        return deps.error(reply, 409, 'IMMUTABLE_OR_MISSING', 'draft文書の項目のみ編集できます');
      await updateKnowledgeEntry(deps.prisma, id, entrySchema.partial().parse(request.body));
      return { status: 'updated' };
    },
    publishDocument: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await manage(deps, request, reply);
      if (!auth) return;
      const { id } = idParamsSchema.parse(request.params);
      const result = await publishKnowledgeDocument(
        deps.prisma,
        auth.organizationId,
        auth.userId,
        id,
      );
      if (!result.count)
        return deps.error(reply, 409, 'IMMUTABLE_OR_MISSING', 'draft版のみ公開できます');
      await audit(deps, request, auth, 'knowledge.published', 'knowledge_version', id);
      return { status: 'published' };
    },
    search: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await deps.authenticate(request, reply);
      if (!auth) return;
      const { id } = idParamsSchema.parse(request.params);
      const { query } = searchSchema.parse(request.body);
      const entries = await searchKnowledge(
        deps.prisma,
        auth.organizationId,
        id,
        query,
        new Date(),
      );
      return {
        results: entries.map((entry) => ({
          entryId: entry.id,
          question: entry.question,
          answer: entry.answer,
        })),
      };
    },
  };
}
