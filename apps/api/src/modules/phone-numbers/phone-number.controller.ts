import type { FastifyReply, FastifyRequest } from 'fastify';
import { phoneInputSchema, phonePatchSchema, idParamsSchema } from '@sales-ai/validation';

import { requestMetadata, writeAudit } from '../../audit.js';
import { findDuplicateCandidates } from '../../stage2-services.js';
import type { AuthContext } from '../../types.js';
import type { CompanyControllerDependencies } from '../companies/company.controller.js';
import { findCompany } from '../companies/company.repository.js';
import { phoneAuditData } from './phone-number.policy.js';
import { findPhoneNumber, listPhoneNumbers, validPhoneContact } from './phone-number.repository.js';
import { createPhoneNumber, deletePhoneNumber, updatePhoneNumber } from './phone-number.service.js';

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
  beforeData: unknown,
  afterData: unknown,
) {
  await writeAudit(deps.prisma, {
    organizationId: auth.organizationId,
    userId: auth.userId,
    action,
    entityType: 'phone_number',
    entityId: id,
    beforeData,
    afterData,
    ...requestMetadata(request),
  });
}

export function createPhoneNumberController(deps: CompanyControllerDependencies) {
  return {
    list: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await deps.authenticate(request, reply);
      if (!auth) return;
      const { id } = idParamsSchema.parse(request.params);
      if (!(await findCompany(deps.prisma, auth, id)))
        return deps.error(reply, 404, 'NOT_FOUND', '企業が見つかりません');
      return { phoneNumbers: await listPhoneNumbers(deps.prisma, auth.organizationId, id) };
    },
    create: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await mutationAuth(deps, request, reply);
      if (!auth) return;
      const { id } = idParamsSchema.parse(request.params);
      if (!(await findCompany(deps.prisma, auth, id)))
        return deps.error(reply, 404, 'NOT_FOUND', '企業が見つかりません');
      const input = phoneInputSchema.parse(request.body);
      if (!(await validPhoneContact(deps.prisma, auth.organizationId, id, input.contactId)))
        return deps.error(reply, 400, 'INVALID_CONTACT', '担当者が正しくありません');
      const phone = await createPhoneNumber(deps.prisma, auth.organizationId, id, input);
      await audit(deps, request, auth, 'phone.created', phone.id, undefined, phoneAuditData(phone));
      return reply.code(201).send({
        phoneNumber: phone,
        duplicateCandidates: await findDuplicateCandidates(
          deps.prisma,
          auth.organizationId,
          { phone: input.rawNumber },
          id,
        ),
      });
    },
    update: (request: FastifyRequest, reply: FastifyReply) =>
      mutatePhoneNumber(deps, request, reply, false),
    remove: (request: FastifyRequest, reply: FastifyReply) =>
      mutatePhoneNumber(deps, request, reply, true),
  };
}

async function mutatePhoneNumber(
  deps: CompanyControllerDependencies,
  request: FastifyRequest,
  reply: FastifyReply,
  deleted: boolean,
) {
  const auth = await mutationAuth(deps, request, reply);
  if (!auth) return;
  const { id } = idParamsSchema.parse(request.params);
  const before = await findPhoneNumber(deps.prisma, auth.organizationId, id);
  if (!before || !(await findCompany(deps.prisma, auth, before.companyId)))
    return deps.error(reply, 404, 'NOT_FOUND', '電話番号が見つかりません');
  const input = deleted ? undefined : phonePatchSchema.parse(request.body);
  if (
    input?.contactId &&
    !(await validPhoneContact(deps.prisma, auth.organizationId, before.companyId, input.contactId))
  )
    return deps.error(reply, 400, 'INVALID_CONTACT', '担当者が正しくありません');
  const phone = deleted
    ? await deletePhoneNumber(deps.prisma, id)
    : await updatePhoneNumber(deps.prisma, before, input ?? {});
  await audit(
    deps,
    request,
    auth,
    deleted ? 'phone.deleted' : 'phone.updated',
    id,
    phoneAuditData(before),
    phoneAuditData(phone),
  );
  return deleted ? reply.code(204).send() : { phoneNumber: phone };
}
