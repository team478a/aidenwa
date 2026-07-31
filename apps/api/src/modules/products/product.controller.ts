import type { FastifyReply, FastifyRequest } from 'fastify';
import { type PrismaClient, type UserRole } from '@sales-ai/database';
import { idParamsSchema, productVersionSchema, resourceInputSchema } from '@sales-ai/validation';

import { requestMetadata, writeAudit } from '../../audit.js';
import type { AuthContext } from '../../types.js';
import { productMutationRoles } from './product.policy.js';
import { findProduct, listProducts } from './product.repository.js';
import {
  archiveProduct,
  createProduct,
  createProductVersion,
  publishProductVersion,
  updateProduct,
} from './product.service.js';

export type ProductControllerDependencies = {
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

async function manage(
  deps: ProductControllerDependencies,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const auth = await deps.authorize(request, reply, productMutationRoles);
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

export function createProductController(deps: ProductControllerDependencies) {
  return {
    list: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await deps.authenticate(request, reply);
      if (!auth) return;
      return { products: await listProducts(deps.prisma, auth.organizationId) };
    },
    create: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await manage(deps, request, reply);
      if (!auth) return;
      const product = await createProduct(
        deps.prisma,
        auth.organizationId,
        auth.userId,
        resourceInputSchema.parse(request.body),
      );
      await audit(deps, request, auth, 'product.created', 'product', product.id, {
        name: product.name,
        code: product.code,
      });
      return reply.code(201).send({ product });
    },
    detail: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await deps.authenticate(request, reply);
      if (!auth) return;
      const { id } = idParamsSchema.parse(request.params);
      const product = await findProduct(deps.prisma, auth.organizationId, id);
      return product ? { product } : deps.error(reply, 404, 'NOT_FOUND', '商材が見つかりません');
    },
    update: (request: FastifyRequest, reply: FastifyReply) =>
      mutateProduct(deps, request, reply, false),
    archive: (request: FastifyRequest, reply: FastifyReply) =>
      mutateProduct(deps, request, reply, true),
    createVersion: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await manage(deps, request, reply);
      if (!auth) return;
      const { id } = idParamsSchema.parse(request.params);
      if (!(await findProduct(deps.prisma, auth.organizationId, id)))
        return deps.error(reply, 404, 'NOT_FOUND', '商材が見つかりません');
      const version = await createProductVersion(
        deps.prisma,
        auth.organizationId,
        auth.userId,
        id,
        productVersionSchema.parse(request.body),
      );
      await audit(deps, request, auth, 'product.version_created', 'product_version', version.id, {
        productId: id,
        version: version.versionNumber,
      });
      return reply.code(201).send({ productVersion: version });
    },
    publishVersion: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await manage(deps, request, reply);
      if (!auth) return;
      const { id } = idParamsSchema.parse(request.params);
      const result = await publishProductVersion(deps.prisma, auth.organizationId, auth.userId, id);
      if (!result.count)
        return deps.error(reply, 409, 'IMMUTABLE_OR_MISSING', 'draft版のみ公開できます');
      await audit(deps, request, auth, 'product.published', 'product_version', id);
      return { status: 'published' };
    },
  };
}

async function mutateProduct(
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
    ? await archiveProduct(deps.prisma, auth.organizationId, id)
    : await updateProduct(deps.prisma, auth.organizationId, id, input.name);
  if (!result.count) return deps.error(reply, 404, 'NOT_FOUND', '対象が見つかりません');
  await audit(deps, request, auth, `product.${archive ? 'archived' : 'updated'}`, 'product', id);
  return { status: archive ? 'archived' : 'updated' };
}
