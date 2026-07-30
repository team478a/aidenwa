import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  companyIdsSchema,
  companyQuerySchema,
  idParamsSchema,
  salesListInputSchema,
  salesListPatchSchema,
} from '@sales-ai/validation';

import { requestMetadata, writeAudit } from '../../audit.js';
import type { AuthContext } from '../../types.js';
import type { CompanyControllerDependencies } from '../companies/company.controller.js';
import { salesListMutationRoles, salesListPreviewScope } from './sales-list.policy.js';
import {
  findSalesList,
  findValidCompanyIds,
  listSalesListCompanies,
  listSalesLists,
  previewCompanies,
} from './sales-list.repository.js';
import {
  changeSalesListCompanies,
  createSalesList,
  deleteSalesList,
  updateSalesList,
} from './sales-list.service.js';

export type SalesListControllerDependencies = CompanyControllerDependencies & {
  bulkOperationLimit: number;
};

async function mutationAuth(
  deps: SalesListControllerDependencies,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const auth = await deps.authorize(request, reply, salesListMutationRoles);
  if (!auth || !deps.verifyCsrf(request, reply, auth)) return;
  return auth;
}

async function audit(
  deps: SalesListControllerDependencies,
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
    entityType: 'sales_list',
    entityId: id,
    beforeData,
    afterData,
    ...requestMetadata(request),
  });
}

export function createSalesListController(deps: SalesListControllerDependencies) {
  return {
    list: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await deps.authenticate(request, reply);
      if (!auth) return;
      return { salesLists: await listSalesLists(deps.prisma, auth.organizationId) };
    },
    create: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await mutationAuth(deps, request, reply);
      if (!auth) return;
      const list = await createSalesList(
        deps.prisma,
        auth.organizationId,
        auth.userId,
        salesListInputSchema.parse(request.body),
      );
      await audit(deps, request, auth, 'sales_list.created', list.id, undefined, list);
      return reply.code(201).send({ salesList: list });
    },
    detail: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await deps.authenticate(request, reply);
      if (!auth) return;
      const { id } = idParamsSchema.parse(request.params);
      const salesList = await findSalesList(deps.prisma, auth.organizationId, id);
      return salesList
        ? { salesList }
        : deps.error(reply, 404, 'NOT_FOUND', 'リストが見つかりません');
    },
    update: (request: FastifyRequest, reply: FastifyReply) =>
      mutateSalesList(deps, request, reply, false),
    remove: (request: FastifyRequest, reply: FastifyReply) =>
      mutateSalesList(deps, request, reply, true),
    companies: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await deps.authenticate(request, reply);
      if (!auth) return;
      const { id } = idParamsSchema.parse(request.params);
      if (!(await findSalesList(deps.prisma, auth.organizationId, id)))
        return deps.error(reply, 404, 'NOT_FOUND', 'リストが見つかりません');
      return { companies: await listSalesListCompanies(deps.prisma, id) };
    },
    addCompanies: (request: FastifyRequest, reply: FastifyReply) =>
      changeCompanies(deps, request, reply, false),
    removeCompany: (request: FastifyRequest, reply: FastifyReply) =>
      changeCompanies(deps, request, reply, true),
    preview: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await deps.authenticate(request, reply);
      if (!auth) return;
      const { id } = idParamsSchema.parse(request.params);
      const list = await findSalesList(deps.prisma, auth.organizationId, id);
      if (!list) return deps.error(reply, 404, 'NOT_FOUND', 'リストが見つかりません');
      const filters = companyQuerySchema.partial().parse(list.filterConditions);
      return {
        companies: await previewCompanies(deps.prisma, salesListPreviewScope(auth, filters)),
        limited: true,
      };
    },
  };
}

async function mutateSalesList(
  deps: SalesListControllerDependencies,
  request: FastifyRequest,
  reply: FastifyReply,
  deleted: boolean,
) {
  const auth = await mutationAuth(deps, request, reply);
  if (!auth) return;
  const { id } = idParamsSchema.parse(request.params);
  const before = await findSalesList(deps.prisma, auth.organizationId, id);
  if (!before) return deps.error(reply, 404, 'NOT_FOUND', 'リストが見つかりません');
  const list = deleted
    ? await deleteSalesList(deps.prisma, id)
    : await updateSalesList(deps.prisma, id, salesListPatchSchema.parse(request.body));
  await audit(
    deps,
    request,
    auth,
    deleted ? 'sales_list.deleted' : 'sales_list.updated',
    id,
    before,
    list,
  );
  return deleted ? reply.code(204).send() : { salesList: list };
}

async function changeCompanies(
  deps: SalesListControllerDependencies,
  request: FastifyRequest,
  reply: FastifyReply,
  remove: boolean,
) {
  const auth = await mutationAuth(deps, request, reply);
  if (!auth) return;
  const params = request.params as { id: string; companyId?: string };
  if (!(await findSalesList(deps.prisma, auth.organizationId, params.id)))
    return deps.error(reply, 404, 'NOT_FOUND', 'リストが見つかりません');
  const companyIds = remove
    ? [String(params.companyId)]
    : companyIdsSchema.parse(request.body).companyIds;
  if (companyIds.length > deps.bulkOperationLimit)
    return deps.error(reply, 413, 'BULK_LIMIT', '一括操作上限を超えています');
  const existing = await findValidCompanyIds(deps.prisma, auth.organizationId, companyIds);
  const results = await changeSalesListCompanies(
    deps.prisma,
    params.id,
    companyIds,
    new Set(existing.map((item) => item.id)),
    auth.userId,
    remove,
  );
  await audit(
    deps,
    request,
    auth,
    remove ? 'sales_list.company_removed' : 'sales_list.company_added',
    params.id,
    undefined,
    { count: results.filter((item) => item.success).length },
  );
  return { results };
}
