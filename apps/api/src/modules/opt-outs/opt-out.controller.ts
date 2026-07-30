import type { FastifyReply, FastifyRequest } from 'fastify';
import { UserRole } from '@sales-ai/database';
import {
  idParamsSchema,
  optOutCheckSchema,
  optOutInputSchema,
  releaseOptOutSchema,
} from '@sales-ai/validation';

import { requestMetadata, writeAudit } from '../../audit.js';
import { checkOptOut } from '../../stage2-services.js';
import type { AuthContext } from '../../types.js';
import type { CompanyControllerDependencies } from '../companies/company.controller.js';
import { findCompany } from '../companies/company.repository.js';
import { optOutAuditData, optOutListScope, optOutReleaseRoles } from './opt-out.policy.js';
import {
  findActiveOptOut,
  findOptOutContact,
  findOptOutPhone,
  listOptOuts,
} from './opt-out.repository.js';
import { createOptOut, releaseOptOut } from './opt-out.service.js';

async function mutationAuth(
  deps: CompanyControllerDependencies,
  request: FastifyRequest,
  reply: FastifyReply,
  roles: readonly UserRole[] = [UserRole.admin, UserRole.manager, UserRole.sales],
) {
  const auth = await deps.authorize(request, reply, roles);
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
    entityType: 'opt_out',
    entityId: id,
    beforeData,
    afterData,
    ...requestMetadata(request),
  });
}

export function createOptOutController(deps: CompanyControllerDependencies) {
  return {
    list: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await deps.authenticate(request, reply);
      if (!auth) return;
      return { optOuts: await listOptOuts(deps.prisma, optOutListScope(auth)) };
    },
    create: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await mutationAuth(deps, request, reply);
      if (!auth) return;
      const input = optOutInputSchema.parse(request.body);
      let company = input.companyId ? await findCompany(deps.prisma, auth, input.companyId) : null;
      const phone = await findOptOutPhone(deps.prisma, auth.organizationId, input.phoneNumberId);
      const contact = await findOptOutContact(deps.prisma, auth.organizationId, input.contactId);
      if (input.companyId && !company)
        return deps.error(reply, 404, 'NOT_FOUND', '企業が見つかりません');
      if (phone && !company) company = await findCompany(deps.prisma, auth, phone.companyId);
      if (contact && !company) company = await findCompany(deps.prisma, auth, contact.companyId);
      if (auth.role === UserRole.sales && !company)
        return deps.error(reply, 403, 'FORBIDDEN', '担当企業のみ登録できます');
      const optOut = await createOptOut(
        deps.prisma,
        auth.organizationId,
        auth.userId,
        input,
        company,
        phone,
        contact,
      );
      await audit(
        deps,
        request,
        auth,
        'opt_out.created',
        optOut.id,
        undefined,
        optOutAuditData(optOut),
      );
      return reply.code(201).send({ optOut });
    },
    check: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await deps.authenticate(request, reply);
      if (!auth) return;
      const input = optOutCheckSchema.parse(request.query);
      if (
        auth.role === UserRole.sales &&
        input.companyId &&
        !(await findCompany(deps.prisma, auth, input.companyId))
      )
        return deps.error(reply, 404, 'NOT_FOUND', '企業が見つかりません');
      return checkOptOut(deps.prisma, auth.organizationId, input);
    },
    release: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await mutationAuth(deps, request, reply, optOutReleaseRoles);
      if (!auth) return;
      const { id } = idParamsSchema.parse(request.params);
      const { releaseReason } = releaseOptOutSchema.parse(request.body);
      const before = await findActiveOptOut(deps.prisma, auth.organizationId, id);
      if (!before) return deps.error(reply, 404, 'NOT_FOUND', '営業禁止が見つかりません');
      const optOut = await releaseOptOut(deps.prisma, id, auth.userId, releaseReason);
      await audit(
        deps,
        request,
        auth,
        'opt_out.released',
        id,
        optOutAuditData(before),
        optOutAuditData(optOut),
      );
      return { optOut };
    },
  };
}
