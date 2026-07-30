import type { FastifyReply, FastifyRequest } from 'fastify';
import { contactInputSchema, contactPatchSchema, idParamsSchema } from '@sales-ai/validation';

import { requestMetadata, writeAudit } from '../../audit.js';
import type { AuthContext } from '../../types.js';
import type { CompanyControllerDependencies } from '../companies/company.controller.js';
import { findCompany } from '../companies/company.repository.js';
import { findContact, listContacts } from './contact.repository.js';
import { createContact, deleteContact, updateContact } from './contact.service.js';

async function mutationAuth(
  deps: CompanyControllerDependencies,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const auth = await deps.authorize(request, reply, ['admin', 'manager', 'sales']);
  if (!auth || !deps.verifyCsrf(request, reply, auth)) return;
  return auth;
}

async function audit(
  deps: CompanyControllerDependencies,
  request: FastifyRequest,
  auth: AuthContext,
  action: string,
  id: string,
  beforeData?: unknown,
  afterData?: unknown,
) {
  await writeAudit(deps.prisma, {
    organizationId: auth.organizationId,
    userId: auth.userId,
    action,
    entityType: 'contact',
    entityId: id,
    beforeData,
    afterData,
    ...requestMetadata(request),
  });
}

export function createContactController(deps: CompanyControllerDependencies) {
  return {
    list: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await deps.authenticate(request, reply);
      if (!auth) return;
      const { id } = idParamsSchema.parse(request.params);
      if (!(await findCompany(deps.prisma, auth, id)))
        return deps.error(reply, 404, 'NOT_FOUND', '企業が見つかりません');
      return { contacts: await listContacts(deps.prisma, auth.organizationId, id) };
    },
    create: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await mutationAuth(deps, request, reply);
      if (!auth) return;
      const { id } = idParamsSchema.parse(request.params);
      if (!(await findCompany(deps.prisma, auth, id)))
        return deps.error(reply, 404, 'NOT_FOUND', '企業が見つかりません');
      const input = contactInputSchema.parse(request.body);
      const contact = await createContact(deps.prisma, auth.organizationId, id, input);
      await audit(deps, request, auth, 'contact.created', contact.id, undefined, contact);
      return reply.code(201).send({ contact });
    },
    update: async (request: FastifyRequest, reply: FastifyReply) => {
      return mutateContact(deps, request, reply, false);
    },
    remove: async (request: FastifyRequest, reply: FastifyReply) => {
      return mutateContact(deps, request, reply, true);
    },
  };
}

async function mutateContact(
  deps: CompanyControllerDependencies,
  request: FastifyRequest,
  reply: FastifyReply,
  deleted: boolean,
) {
  const auth = await mutationAuth(deps, request, reply);
  if (!auth) return;
  const { id } = idParamsSchema.parse(request.params);
  const before = await findContact(deps.prisma, auth.organizationId, id);
  if (!before || !(await findCompany(deps.prisma, auth, before.companyId)))
    return deps.error(reply, 404, 'NOT_FOUND', '担当者が見つかりません');
  const contact = deleted
    ? await deleteContact(deps.prisma, id)
    : await updateContact(deps.prisma, id, contactPatchSchema.parse(request.body));
  await audit(
    deps,
    request,
    auth,
    deleted ? 'contact.deleted' : 'contact.updated',
    id,
    before,
    contact,
  );
  return deleted ? reply.code(204).send() : { contact };
}
