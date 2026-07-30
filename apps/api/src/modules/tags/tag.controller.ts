import type { FastifyReply, FastifyRequest } from 'fastify';
import { idParamsSchema, tagInputSchema, tagPatchSchema } from '@sales-ai/validation';

import { requestMetadata, writeAudit } from '../../audit.js';
import type { AuthContext } from '../../types.js';
import type { CompanyControllerDependencies } from '../companies/company.controller.js';
import { findCompany } from '../companies/company.repository.js';
import { tagMutationRoles } from './tag.policy.js';
import { countTagAssignments, findTag, listCompanyTags, listTags } from './tag.repository.js';
import { assignTag, createTag, deleteTag, removeTag, updateTag } from './tag.service.js';

async function mutationAuth(
  deps: CompanyControllerDependencies,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const auth = await deps.authorize(request, reply, tagMutationRoles);
  if (!auth || !deps.verifyCsrf(request, reply, auth)) return;
  return auth;
}

async function audit(
  deps: CompanyControllerDependencies,
  request: FastifyRequest,
  auth: AuthContext,
  action: string,
  entityType: string,
  id: string,
  beforeData?: unknown,
  afterData?: unknown,
) {
  await writeAudit(deps.prisma, {
    organizationId: auth.organizationId,
    userId: auth.userId,
    action,
    entityType,
    entityId: id,
    beforeData,
    afterData,
    ...requestMetadata(request),
  });
}

export function createTagController(deps: CompanyControllerDependencies) {
  return {
    list: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await deps.authenticate(request, reply);
      if (!auth) return;
      return { tags: await listTags(deps.prisma, auth.organizationId) };
    },
    create: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await mutationAuth(deps, request, reply);
      if (!auth) return;
      const tag = await createTag(
        deps.prisma,
        auth.organizationId,
        tagInputSchema.parse(request.body),
      );
      await audit(deps, request, auth, 'tag.created', 'tag', tag.id, undefined, tag);
      return reply.code(201).send({ tag });
    },
    update: (request: FastifyRequest, reply: FastifyReply) =>
      mutateTag(deps, request, reply, false),
    remove: (request: FastifyRequest, reply: FastifyReply) => mutateTag(deps, request, reply, true),
    listCompanies: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await deps.authenticate(request, reply);
      if (!auth) return;
      const { id } = idParamsSchema.parse(request.params);
      if (!(await findCompany(deps.prisma, auth, id)))
        return deps.error(reply, 404, 'NOT_FOUND', '企業が見つかりません');
      return { tags: await listCompanyTags(deps.prisma, id) };
    },
    assign: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await mutationAuth(deps, request, reply);
      if (!auth) return;
      const { id } = idParamsSchema.parse(request.params);
      const { id: tagId } = idParamsSchema.parse({
        id: (request.body as { tagId?: unknown }).tagId,
      });
      if (
        !(await findCompany(deps.prisma, auth, id)) ||
        !(await findTag(deps.prisma, auth.organizationId, tagId))
      )
        return deps.error(reply, 404, 'NOT_FOUND', '企業またはタグが見つかりません');
      const companyTag = await assignTag(deps.prisma, id, tagId, auth.userId);
      await audit(deps, request, auth, 'company.tag_added', 'company', id, undefined, {
        tagId,
      });
      return reply.code(201).send({ companyTag });
    },
    unassign: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await mutationAuth(deps, request, reply);
      if (!auth) return;
      const { id, tagId } = request.params as { id: string; tagId: string };
      if (
        !(await findCompany(deps.prisma, auth, id)) ||
        !(await findTag(deps.prisma, auth.organizationId, tagId))
      )
        return deps.error(reply, 404, 'NOT_FOUND', '企業またはタグが見つかりません');
      await removeTag(deps.prisma, id, tagId);
      await audit(deps, request, auth, 'company.tag_removed', 'company', id, { tagId });
      return reply.code(204).send();
    },
  };
}

async function mutateTag(
  deps: CompanyControllerDependencies,
  request: FastifyRequest,
  reply: FastifyReply,
  deleted: boolean,
) {
  const auth = await mutationAuth(deps, request, reply);
  if (!auth) return;
  const { id } = idParamsSchema.parse(request.params);
  const before = await findTag(deps.prisma, auth.organizationId, id);
  if (!before) return deps.error(reply, 404, 'NOT_FOUND', 'タグが見つかりません');
  if (deleted && (await countTagAssignments(deps.prisma, id)))
    return deps.error(reply, 409, 'TAG_IN_USE', '使用中タグは削除できません');
  const tag = deleted
    ? await deleteTag(deps.prisma, id)
    : await updateTag(deps.prisma, id, tagPatchSchema.parse(request.body));
  await audit(
    deps,
    request,
    auth,
    deleted ? 'tag.deleted' : 'tag.updated',
    'tag',
    id,
    before,
    deleted ? undefined : tag,
  );
  return deleted ? reply.code(204).send() : { tag };
}
