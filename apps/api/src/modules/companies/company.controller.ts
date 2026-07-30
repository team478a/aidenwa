import type { FastifyReply, FastifyRequest } from 'fastify';
import { type PrismaClient, UserRole } from '@sales-ai/database';
import {
  companyInputSchema,
  companyPatchSchema,
  companyQuerySchema,
  idParamsSchema,
} from '@sales-ai/validation';

import { requestMetadata, writeAudit } from '../../audit.js';
import { findDuplicateCandidates } from '../../stage2-services.js';
import type { AuthContext } from '../../types.js';
import { canAssignCompanyOwner } from './company.policy.js';
import {
  findCompany,
  findCompanyDetail,
  isValidOwner,
  listCompanies,
} from './company.repository.js';
import { createCompany, deleteCompany, updateCompany } from './company.service.js';

export type CompanyControllerDependencies = {
  prisma: PrismaClient;
  authenticate(request: FastifyRequest, reply: FastifyReply): Promise<AuthContext | undefined>;
  authorize(
    request: FastifyRequest,
    reply: FastifyReply,
    roles: readonly UserRole[],
  ): Promise<AuthContext | undefined>;
  verifyCsrf(request: FastifyRequest, reply: FastifyReply, auth: AuthContext): boolean;
  error(reply: FastifyReply, code: number, key: string, message: string): unknown;
};

async function mutationAuth(
  deps: CompanyControllerDependencies,
  request: FastifyRequest,
  reply: FastifyReply,
  roles = [UserRole.admin, UserRole.manager, UserRole.sales],
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
    entityType: 'company',
    entityId: id,
    beforeData,
    afterData,
    ...requestMetadata(request),
  });
}

export function createCompanyController(deps: CompanyControllerDependencies) {
  return {
    list: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await deps.authenticate(request, reply);
      if (!auth) return;
      const q = companyQuerySchema.parse(request.query);
      const { companies, total } = await listCompanies(deps.prisma, auth, q);
      return {
        companies,
        pagination: {
          page: q.page,
          pageSize: q.pageSize,
          total,
          pages: Math.ceil(total / q.pageSize),
        },
      };
    },
    create: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await mutationAuth(deps, request, reply);
      if (!auth) return;
      const input = companyInputSchema.parse(request.body);
      if (!(await isValidOwner(deps.prisma, auth.organizationId, input.ownerUserId)))
        return deps.error(reply, 400, 'INVALID_OWNER', '担当営業が正しくありません');
      if (!canAssignCompanyOwner(auth, input.ownerUserId))
        return deps.error(reply, 403, 'FORBIDDEN', '他の担当者へ割り当てできません');
      const company = await createCompany(deps.prisma, auth, input);
      await audit(deps, request, auth, 'company.created', company.id, undefined, company);
      return reply.code(201).send({
        company,
        duplicateCandidates: await findDuplicateCandidates(
          deps.prisma,
          auth.organizationId,
          input,
          company.id,
        ),
      });
    },
    detail: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await deps.authenticate(request, reply);
      if (!auth) return;
      const { id } = idParamsSchema.parse(request.params);
      const company = await findCompanyDetail(deps.prisma, auth, id);
      return company ? { company } : deps.error(reply, 404, 'NOT_FOUND', '企業が見つかりません');
    },
    update: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await mutationAuth(deps, request, reply);
      if (!auth) return;
      const { id } = idParamsSchema.parse(request.params);
      const before = await findCompany(deps.prisma, auth, id);
      if (!before) return deps.error(reply, 404, 'NOT_FOUND', '企業が見つかりません');
      const input = companyPatchSchema.parse(request.body);
      if (!(await isValidOwner(deps.prisma, auth.organizationId, input.ownerUserId)))
        return deps.error(reply, 400, 'INVALID_OWNER', '担当営業が正しくありません');
      if (!canAssignCompanyOwner(auth, input.ownerUserId))
        return deps.error(reply, 403, 'FORBIDDEN', '担当営業を変更できません');
      const company = await updateCompany(deps.prisma, id, input);
      const action =
        input.ownerUserId !== undefined && input.ownerUserId !== before.ownerUserId
          ? 'company.owner_changed'
          : 'company.updated';
      await audit(deps, request, auth, action, id, before, company);
      return { company };
    },
    remove: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await mutationAuth(deps, request, reply, [UserRole.admin, UserRole.manager]);
      if (!auth) return;
      const { id } = idParamsSchema.parse(request.params);
      const before = await deps.prisma.company.findFirst({
        where: { id, organizationId: auth.organizationId, isDeleted: false },
      });
      if (!before) return deps.error(reply, 404, 'NOT_FOUND', '企業が見つかりません');
      const company = await deleteCompany(deps.prisma, id);
      await audit(deps, request, auth, 'company.deleted', id, before, company);
      return reply.code(204).send();
    },
    duplicates: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await deps.authenticate(request, reply);
      if (!auth) return;
      const { id } = idParamsSchema.parse(request.params);
      const company = await findCompany(deps.prisma, auth, id);
      if (!company) return deps.error(reply, 404, 'NOT_FOUND', '企業が見つかりません');
      const phone = await deps.prisma.phoneNumber.findFirst({
        where: { companyId: id, organizationId: auth.organizationId, isDeleted: false },
      });
      return {
        candidates: await findDuplicateCandidates(
          deps.prisma,
          auth.organizationId,
          { ...company, phone: phone?.rawNumber },
          id,
        ),
        autoMerged: false,
      };
    },
  };
}
