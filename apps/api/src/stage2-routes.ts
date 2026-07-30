import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import multipart from '@fastify/multipart';
import { Prisma, type PrismaClient, UserRole } from '@sales-ai/database';
import {
  normalizeCompanyName,
  normalizeEmail,
  normalizePhoneNumber,
} from '@sales-ai/shared/stage2';
import {
  companyIdsSchema,
  companyQuerySchema,
  idParamsSchema,
  optOutCheckSchema,
  optOutInputSchema,
  phoneInputSchema,
  phonePatchSchema,
  releaseOptOutSchema,
  salesListInputSchema,
  salesListPatchSchema,
  tagInputSchema,
  tagPatchSchema,
} from '@sales-ai/validation';
import { requestMetadata, writeAudit } from './audit.js';
import { registerCompanyRoutes } from './modules/companies/company.routes.js';
import { registerContactRoutes } from './modules/contacts/contact.routes.js';
import { registerImportRoutes } from './modules/imports/import.routes.js';
import { checkOptOut, findDuplicateCandidates } from './stage2-services.js';
import type { AuthContext } from './types.js';

type Deps = {
  prisma: PrismaClient;
  env: {
    REDIS_URL: string;
    CSV_MAX_BYTES: number;
    CSV_MAX_ROWS: number;
    IMPORT_RETENTION_HOURS: number;
    BULK_OPERATION_LIMIT: number;
  };
  authenticate(request: FastifyRequest, reply: FastifyReply): Promise<AuthContext | undefined>;
  authorize(
    request: FastifyRequest,
    reply: FastifyReply,
    roles: readonly UserRole[],
  ): Promise<AuthContext | undefined>;
  verifyCsrf(request: FastifyRequest, reply: FastifyReply, auth: AuthContext): boolean;
  error(reply: FastifyReply, code: number, key: string, message: string): unknown;
};
export function registerStage2Routes(app: FastifyInstance, deps: Deps) {
  const { prisma } = deps;
  void app.register(multipart, { limits: { fileSize: deps.env.CSV_MAX_BYTES, files: 1 } });
  const companyScope = (auth: AuthContext): Prisma.CompanyWhereInput => ({
    organizationId: auth.organizationId,
    isDeleted: false,
    ...(auth.role === UserRole.sales ? { ownerUserId: auth.userId } : {}),
  });
  async function getCompany(auth: AuthContext, id: string) {
    return prisma.company.findFirst({ where: { id, ...companyScope(auth) } });
  }
  async function mutationAuth(
    request: FastifyRequest,
    reply: FastifyReply,
    roles = [UserRole.admin, UserRole.manager, UserRole.sales],
  ) {
    const auth = await deps.authorize(request, reply, roles);
    if (!auth || !deps.verifyCsrf(request, reply, auth)) return;
    return auth;
  }
  registerImportRoutes(app, {
    prisma,
    env: deps.env,
    authenticate: (request, reply) => deps.authenticate(request, reply),
    mutationAuth,
    error: (reply, code, key, message) => deps.error(reply, code, key, message),
    audit: (request, auth, action, entityType, entityId, afterData) =>
      auditChild(request, auth, action, entityType, entityId, undefined, afterData),
  });
  registerCompanyRoutes(app, deps);
  registerContactRoutes(app, deps);
  app.get('/api/v1/companies/:id/phone-numbers', async (request, reply) =>
    phoneList(request, reply),
  );
  app.post('/api/v1/companies/:id/phone-numbers', async (request, reply) => {
    const auth = await mutationAuth(request, reply);
    if (!auth) return;
    const { id } = idParamsSchema.parse(request.params);
    if (!(await getCompany(auth, id)))
      return deps.error(reply, 404, 'NOT_FOUND', '企業が見つかりません');
    const input = phoneInputSchema.parse(request.body);
    if (
      input.contactId &&
      !(await prisma.companyContact.findFirst({
        where: {
          id: input.contactId,
          companyId: id,
          organizationId: auth.organizationId,
          isDeleted: false,
        },
      }))
    )
      return deps.error(reply, 400, 'INVALID_CONTACT', '担当者が正しくありません');
    const normalized = normalizePhoneNumber(input.rawNumber);
    const isCallable = input.type === 'fax' ? false : input.isCallable && normalized.isValid;
    const phone = await prisma.$transaction(async (tx) => {
      if (input.isPrimary)
        await tx.phoneNumber.updateMany({
          where: { organizationId: auth.organizationId, companyId: id, isDeleted: false },
          data: { isPrimary: false },
        });
      return tx.phoneNumber.create({
        data: {
          organizationId: auth.organizationId,
          companyId: id,
          ...clean(input),
          ...normalized,
          isCallable,
        },
      });
    });
    await auditChild(request, auth, 'phone.created', 'phone_number', phone.id, undefined, phone);
    return reply.code(201).send({
      phoneNumber: phone,
      duplicateCandidates: await findDuplicateCandidates(
        prisma,
        auth.organizationId,
        { phone: input.rawNumber },
        id,
      ),
    });
  });
  app.patch('/api/v1/phone-numbers/:id', async (request, reply) =>
    updatePhone(request, reply, false),
  );
  app.delete('/api/v1/phone-numbers/:id', async (request, reply) =>
    updatePhone(request, reply, true),
  );

  app.get('/api/v1/tags', async (request, reply) => {
    const auth = await deps.authenticate(request, reply);
    if (!auth) return;
    return {
      tags: await prisma.tag.findMany({
        where: { organizationId: auth.organizationId },
        include: { _count: { select: { companyTags: true } } },
        orderBy: { name: 'asc' },
      }),
    };
  });
  app.post('/api/v1/tags', async (request, reply) => createManaged(request, reply, 'tag'));
  app.patch('/api/v1/tags/:id', async (request, reply) =>
    updateManaged(request, reply, 'tag', false),
  );
  app.delete('/api/v1/tags/:id', async (request, reply) =>
    updateManaged(request, reply, 'tag', true),
  );
  app.get('/api/v1/companies/:id/tags', async (request, reply) => {
    const auth = await deps.authenticate(request, reply);
    if (!auth) return;
    const { id } = idParamsSchema.parse(request.params);
    if (!(await getCompany(auth, id)))
      return deps.error(reply, 404, 'NOT_FOUND', '企業が見つかりません');
    return {
      tags: await prisma.companyTag.findMany({ where: { companyId: id }, include: { tag: true } }),
    };
  });
  app.post('/api/v1/companies/:id/tags', async (request, reply) => {
    const auth = await mutationAuth(request, reply, [UserRole.admin, UserRole.manager]);
    if (!auth) return;
    const { id } = idParamsSchema.parse(request.params);
    const { id: tagId } = idParamsSchema.parse({
      id: (request.body as { tagId?: unknown }).tagId,
    });
    if (
      !(await prisma.company.findFirst({
        where: { id, organizationId: auth.organizationId, isDeleted: false },
      })) ||
      !(await prisma.tag.findFirst({ where: { id: tagId, organizationId: auth.organizationId } }))
    )
      return deps.error(reply, 404, 'NOT_FOUND', '企業またはタグが見つかりません');
    const relation = await prisma.companyTag.upsert({
      where: { companyId_tagId: { companyId: id, tagId } },
      update: {},
      create: { companyId: id, tagId, assignedBy: auth.userId },
    });
    await auditChild(request, auth, 'company.tag_added', 'company', id, undefined, { tagId });
    return reply.code(201).send({ companyTag: relation });
  });
  app.delete('/api/v1/companies/:id/tags/:tagId', async (request, reply) => {
    const auth = await mutationAuth(request, reply, [UserRole.admin, UserRole.manager]);
    if (!auth) return;
    const { id, tagId } = request.params as { id: string; tagId: string };
    const company = await prisma.company.findFirst({
      where: { id, organizationId: auth.organizationId },
    });
    const tag = await prisma.tag.findFirst({
      where: { id: tagId, organizationId: auth.organizationId },
    });
    if (!company || !tag)
      return deps.error(reply, 404, 'NOT_FOUND', '企業またはタグが見つかりません');
    await prisma.companyTag.deleteMany({ where: { companyId: id, tagId } });
    await auditChild(request, auth, 'company.tag_removed', 'company', id, { tagId }, undefined);
    return reply.code(204).send();
  });

  app.get('/api/v1/sales-lists', async (request, reply) => {
    const auth = await deps.authenticate(request, reply);
    if (!auth) return;
    return {
      salesLists: await prisma.salesList.findMany({
        where: { organizationId: auth.organizationId, isDeleted: false },
        include: {
          creator: { select: { id: true, name: true } },
          _count: { select: { companies: { where: { removedAt: null } } } },
        },
        orderBy: { updatedAt: 'desc' },
      }),
    };
  });
  app.post('/api/v1/sales-lists', async (request, reply) => createManaged(request, reply, 'list'));
  app.get('/api/v1/sales-lists/:id', async (request, reply) => {
    const auth = await deps.authenticate(request, reply);
    if (!auth) return;
    const { id } = idParamsSchema.parse(request.params);
    const salesList = await prisma.salesList.findFirst({
      where: { id, organizationId: auth.organizationId, isDeleted: false },
    });
    return salesList
      ? { salesList }
      : deps.error(reply, 404, 'NOT_FOUND', 'リストが見つかりません');
  });
  app.patch('/api/v1/sales-lists/:id', async (request, reply) =>
    updateManaged(request, reply, 'list', false),
  );
  app.delete('/api/v1/sales-lists/:id', async (request, reply) =>
    updateManaged(request, reply, 'list', true),
  );
  app.get('/api/v1/sales-lists/:id/companies', async (request, reply) => {
    const auth = await deps.authenticate(request, reply);
    if (!auth) return;
    const { id } = idParamsSchema.parse(request.params);
    const list = await prisma.salesList.findFirst({
      where: { id, organizationId: auth.organizationId, isDeleted: false },
    });
    if (!list) return deps.error(reply, 404, 'NOT_FOUND', 'リストが見つかりません');
    return {
      companies: await prisma.salesListCompany.findMany({
        where: { salesListId: id, removedAt: null },
        include: { company: true },
      }),
    };
  });
  app.post('/api/v1/sales-lists/:id/companies', async (request, reply) =>
    listCompanies(request, reply, false),
  );
  app.delete('/api/v1/sales-lists/:id/companies/:companyId', async (request, reply) =>
    listCompanies(request, reply, true),
  );
  app.post('/api/v1/sales-lists/:id/preview', async (request, reply) => {
    const auth = await deps.authenticate(request, reply);
    if (!auth) return;
    const { id } = idParamsSchema.parse(request.params);
    const list = await prisma.salesList.findFirst({
      where: { id, organizationId: auth.organizationId, isDeleted: false },
    });
    if (!list) return deps.error(reply, 404, 'NOT_FOUND', 'リストが見つかりません');
    const filters = companyQuerySchema.partial().parse(list.filterConditions);
    return {
      companies: await prisma.company.findMany({
        where: {
          ...companyScope(auth),
          ...(filters.q ? { normalizedName: { contains: normalizeCompanyName(filters.q) } } : {}),
          ...(filters.salesStatus ? { salesStatus: filters.salesStatus } : {}),
        },
        take: 100,
      }),
      limited: true,
    };
  });

  app.get('/api/v1/opt-outs', async (request, reply) => {
    const auth = await deps.authenticate(request, reply);
    if (!auth) return;
    return {
      optOuts: await prisma.optOut.findMany({
        where: {
          organizationId: auth.organizationId,
          ...(auth.role === UserRole.sales ? { company: { ownerUserId: auth.userId } } : {}),
        },
        include: {
          company: { select: { id: true, name: true } },
          phoneNumber: true,
          contact: true,
          registrar: { select: { id: true, name: true } },
          releaser: { select: { id: true, name: true } },
        },
        orderBy: { registeredAt: 'desc' },
        take: 500,
      }),
    };
  });
  app.post('/api/v1/opt-outs', async (request, reply) => {
    const auth = await mutationAuth(request, reply);
    if (!auth) return;
    const input = optOutInputSchema.parse(request.body);
    let company = input.companyId ? await getCompany(auth, input.companyId) : null;
    const phone = input.phoneNumberId
      ? await prisma.phoneNumber.findFirst({
          where: { id: input.phoneNumberId, organizationId: auth.organizationId },
        })
      : null;
    const contact = input.contactId
      ? await prisma.companyContact.findFirst({
          where: { id: input.contactId, organizationId: auth.organizationId },
        })
      : null;
    if (input.companyId && !company)
      return deps.error(reply, 404, 'NOT_FOUND', '企業が見つかりません');
    if (phone && !company) company = await getCompany(auth, phone.companyId);
    if (contact && !company) company = await getCompany(auth, contact.companyId);
    if (auth.role === UserRole.sales && !company)
      return deps.error(reply, 403, 'FORBIDDEN', '担当企業のみ登録できます');
    const optOut = await prisma.optOut.create({
      data: {
        organizationId: auth.organizationId,
        companyId: company?.id,
        phoneNumberId: phone?.id,
        contactId: contact?.id,
        normalizedPhoneSnapshot:
          phone?.normalizedNumber ??
          (input.phone ? normalizePhoneNumber(input.phone).normalizedNumber : null),
        emailSnapshot: contact?.email ?? normalizeEmail(input.email),
        scope: input.scope,
        channel: input.channel,
        reasonCode: input.reasonCode,
        reasonText: input.reasonText,
        evidenceText: input.evidenceText,
        registeredBy: auth.userId,
      },
    });
    if (company)
      await prisma.company.update({ where: { id: company.id }, data: { salesStatus: 'opt_out' } });
    await auditChild(request, auth, 'opt_out.created', 'opt_out', optOut.id, undefined, optOut);
    return reply.code(201).send({ optOut });
  });
  app.get('/api/v1/opt-outs/check', async (request, reply) => {
    const auth = await deps.authenticate(request, reply);
    if (!auth) return;
    const input = optOutCheckSchema.parse(request.query);
    if (
      auth.role === UserRole.sales &&
      input.companyId &&
      !(await getCompany(auth, input.companyId))
    )
      return deps.error(reply, 404, 'NOT_FOUND', '企業が見つかりません');
    return checkOptOut(prisma, auth.organizationId, input);
  });
  app.post('/api/v1/opt-outs/:id/release', async (request, reply) => {
    const auth = await mutationAuth(request, reply, [UserRole.admin]);
    if (!auth) return;
    const { id } = idParamsSchema.parse(request.params);
    const { releaseReason } = releaseOptOutSchema.parse(request.body);
    const before = await prisma.optOut.findFirst({
      where: { id, organizationId: auth.organizationId, status: 'active' },
    });
    if (!before) return deps.error(reply, 404, 'NOT_FOUND', '営業禁止が見つかりません');
    const optOut = await prisma.optOut.update({
      where: { id },
      data: { status: 'released', releasedBy: auth.userId, releasedAt: new Date(), releaseReason },
    });
    await auditChild(request, auth, 'opt_out.released', 'opt_out', id, before, optOut);
    return { optOut };
  });

  async function phoneList(request: FastifyRequest, reply: FastifyReply) {
    const auth = await deps.authenticate(request, reply);
    if (!auth) return;
    const { id } = idParamsSchema.parse(request.params);
    if (!(await getCompany(auth, id)))
      return deps.error(reply, 404, 'NOT_FOUND', '企業が見つかりません');
    return {
      phoneNumbers: await prisma.phoneNumber.findMany({
        where: { organizationId: auth.organizationId, companyId: id, isDeleted: false },
      }),
    };
  }
  async function updatePhone(request: FastifyRequest, reply: FastifyReply, deleted: boolean) {
    const auth = await mutationAuth(request, reply);
    if (!auth) return;
    const { id } = idParamsSchema.parse(request.params);
    const before = await prisma.phoneNumber.findFirst({
      where: { id, organizationId: auth.organizationId, isDeleted: false },
    });
    if (!before || !(await getCompany(auth, before.companyId)))
      return deps.error(reply, 404, 'NOT_FOUND', '電話番号が見つかりません');
    const input = deleted ? {} : phonePatchSchema.parse(request.body);
    if (
      input.contactId &&
      !(await prisma.companyContact.findFirst({
        where: {
          id: input.contactId,
          organizationId: auth.organizationId,
          companyId: before.companyId,
          isDeleted: false,
        },
      }))
    )
      return deps.error(reply, 400, 'INVALID_CONTACT', '担当者が正しくありません');
    const normalized = input.rawNumber ? normalizePhoneNumber(input.rawNumber) : {};
    const type = input.type ?? before.type;
    const isCallable = type === 'fax' ? false : input.isCallable;
    const phone = await prisma.$transaction(async (tx) => {
      if (input.isPrimary)
        await tx.phoneNumber.updateMany({
          where: { companyId: before.companyId, isDeleted: false },
          data: { isPrimary: false },
        });
      return tx.phoneNumber.update({
        where: { id },
        data: deleted
          ? { isDeleted: true, isPrimary: false }
          : { ...clean(input), ...normalized, ...(isCallable !== undefined ? { isCallable } : {}) },
      });
    });
    await auditChild(
      request,
      auth,
      deleted ? 'phone.deleted' : 'phone.updated',
      'phone_number',
      id,
      before,
      phone,
    );
    return deleted ? reply.code(204).send() : { phoneNumber: phone };
  }
  async function createManaged(request: FastifyRequest, reply: FastifyReply, kind: 'tag' | 'list') {
    const auth = await mutationAuth(request, reply, [UserRole.admin, UserRole.manager]);
    if (!auth) return;
    if (kind === 'tag') {
      const input = tagInputSchema.parse(request.body);
      const tag = await prisma.tag.create({
        data: { organizationId: auth.organizationId, ...clean(input) },
      });
      await auditChild(request, auth, 'tag.created', 'tag', tag.id, undefined, tag);
      return reply.code(201).send({ tag });
    }
    const input = salesListInputSchema.parse(request.body);
    const list = await prisma.salesList.create({
      data: {
        organizationId: auth.organizationId,
        createdBy: auth.userId,
        ...clean(input),
        filterConditions: input.filterConditions,
      },
    });
    await auditChild(request, auth, 'sales_list.created', 'sales_list', list.id, undefined, list);
    return reply.code(201).send({ salesList: list });
  }
  async function updateManaged(
    request: FastifyRequest,
    reply: FastifyReply,
    kind: 'tag' | 'list',
    deleted: boolean,
  ) {
    const auth = await mutationAuth(request, reply, [UserRole.admin, UserRole.manager]);
    if (!auth) return;
    const { id } = idParamsSchema.parse(request.params);
    if (kind === 'tag') {
      const before = await prisma.tag.findFirst({
        where: { id, organizationId: auth.organizationId },
      });
      if (!before) return deps.error(reply, 404, 'NOT_FOUND', 'タグが見つかりません');
      if (deleted && (await prisma.companyTag.count({ where: { tagId: id } })))
        return deps.error(reply, 409, 'TAG_IN_USE', '使用中タグは削除できません');
      const tag = deleted
        ? await prisma.tag.delete({ where: { id } })
        : await prisma.tag.update({
            where: { id },
            data: clean(tagPatchSchema.parse(request.body)),
          });
      await auditChild(
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
    const before = await prisma.salesList.findFirst({
      where: { id, organizationId: auth.organizationId, isDeleted: false },
    });
    if (!before) return deps.error(reply, 404, 'NOT_FOUND', 'リストが見つかりません');
    const input = deleted ? {} : salesListPatchSchema.parse(request.body);
    const list = await prisma.salesList.update({
      where: { id },
      data: deleted
        ? { isDeleted: true }
        : {
            ...clean(input),
            ...(input.filterConditions
              ? { filterConditions: input.filterConditions as Prisma.InputJsonValue }
              : {}),
          },
    });
    await auditChild(
      request,
      auth,
      deleted ? 'sales_list.deleted' : 'sales_list.updated',
      'sales_list',
      id,
      before,
      list,
    );
    return deleted ? reply.code(204).send() : { salesList: list };
  }
  async function listCompanies(request: FastifyRequest, reply: FastifyReply, remove: boolean) {
    const auth = await mutationAuth(request, reply, [UserRole.admin, UserRole.manager]);
    if (!auth) return;
    const params = request.params as { id: string; companyId?: string };
    const list = await prisma.salesList.findFirst({
      where: { id: params.id, organizationId: auth.organizationId, isDeleted: false },
    });
    if (!list) return deps.error(reply, 404, 'NOT_FOUND', 'リストが見つかりません');
    const companyIds = remove
      ? [String(params.companyId)]
      : companyIdsSchema.parse(request.body).companyIds;
    if (companyIds.length > deps.env.BULK_OPERATION_LIMIT)
      return deps.error(reply, 413, 'BULK_LIMIT', '一括操作上限を超えています');
    const existing = await prisma.company.findMany({
      where: { id: { in: companyIds }, organizationId: auth.organizationId, isDeleted: false },
      select: { id: true },
    });
    const valid = new Set(existing.map((item) => item.id));
    const results = [];
    for (const companyId of companyIds) {
      if (!valid.has(companyId)) {
        results.push({ companyId, success: false, error: 'not_found' });
        continue;
      }
      if (remove)
        await prisma.salesListCompany.updateMany({
          where: { salesListId: params.id, companyId, removedAt: null },
          data: { removedAt: new Date() },
        });
      else
        await prisma.salesListCompany.upsert({
          where: { salesListId_companyId: { salesListId: params.id, companyId } },
          update: { removedAt: null, addedBy: auth.userId, addedAt: new Date() },
          create: { salesListId: params.id, companyId, addedBy: auth.userId },
        });
      results.push({ companyId, success: true });
    }
    await auditChild(
      request,
      auth,
      remove ? 'sales_list.company_removed' : 'sales_list.company_added',
      'sales_list',
      params.id,
      undefined,
      { count: results.filter((item) => item.success).length },
    );
    return { results };
  }
  async function auditChild(
    request: FastifyRequest,
    auth: AuthContext,
    action: string,
    entityType: string,
    entityId: string,
    beforeData?: unknown,
    afterData?: unknown,
  ) {
    await writeAudit(prisma, {
      organizationId: auth.organizationId,
      userId: auth.userId,
      action,
      entityType,
      entityId,
      beforeData,
      afterData,
      ...requestMetadata(request),
    });
  }
}

function clean<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}
