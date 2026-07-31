import type { FastifyReply, FastifyRequest } from 'fastify';
import { allowlistSchema, reasonSchema } from '@sales-ai/validation';
import { requestMetadata, writeAudit } from '../../../audit.js';
import type { ProductControllerDependencies } from '../../products/product.controller.js';
import {
  allowlistMutationRoles,
  allowlistReadRoles,
  maskedPhone,
  resolveAllowlistOrganization,
} from './allowlist.policy.js';
import {
  disableAllowlistEntry,
  findAllowlistEntry,
  listAllowlist,
} from './allowlist.repository.js';
import { registerAllowlistEntry } from './allowlist.service.js';

export type AllowlistControllerDependencies = ProductControllerDependencies;

export function createAllowlistController(deps: AllowlistControllerDependencies) {
  return {
    list: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await deps.authorize(request, reply, allowlistReadRoles);
      if (!auth) return;
      const query = request.query as { organizationId?: string };
      const organizationId = resolveAllowlistOrganization(auth, query.organizationId);
      const rows = await listAllowlist(deps.prisma, organizationId);
      return {
        allowlist: rows.map(({ normalizedPhoneNumber, ...row }) => ({
          ...row,
          maskedPhone: maskedPhone(normalizedPhoneNumber.slice(-4)),
        })),
      };
    },
    register: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await deps.authorize(request, reply, allowlistMutationRoles);
      if (!auth || !deps.verifyCsrf(request, reply, auth)) return;
      const parsed = allowlistSchema.safeParse(request.body);
      if (!parsed.success) return deps.error(reply, 400, 'VALIDATION_ERROR', parsed.error.message);
      const organizationId = resolveAllowlistOrganization(auth, parsed.data.organizationId);
      const row = await registerAllowlistEntry(
        deps.prisma,
        organizationId,
        auth.userId,
        parsed.data,
      );
      if (!row) return deps.error(reply, 400, 'INVALID_PHONE', '電話番号が不正です');
      await writeAudit(deps.prisma, {
        organizationId,
        userId: auth.userId,
        action: 'test_allowlist.registered',
        entityType: 'test_call_allowlist',
        entityId: row.id,
        afterData: {
          maskedPhone: maskedPhone(row.phoneLastFour),
          region: row.region,
          expiresAt: row.expiresAt,
        },
        ...requestMetadata(request),
      });
      return reply.code(201).send({
        allowlist: {
          ...row,
          normalizedPhoneNumber: undefined,
          maskedPhone: maskedPhone(row.phoneLastFour),
        },
      });
    },
    disable: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await deps.authorize(request, reply, allowlistMutationRoles);
      if (!auth || !deps.verifyCsrf(request, reply, auth)) return;
      const parsed = reasonSchema.safeParse(request.body);
      if (!parsed.success) return deps.error(reply, 400, 'REASON_REQUIRED', '理由が必要です');
      const id = (request.params as { id: string }).id;
      if (!(await findAllowlistEntry(deps.prisma, auth.organizationId, id)))
        return deps.error(reply, 404, 'NOT_FOUND', '許可番号がありません');
      const row = await disableAllowlistEntry(deps.prisma, id);
      await writeAudit(deps.prisma, {
        organizationId: auth.organizationId,
        userId: auth.userId,
        action: 'test_allowlist.disabled',
        entityType: 'test_call_allowlist',
        entityId: id,
        afterData: { reason: parsed.data.reason, maskedPhone: maskedPhone(row.phoneLastFour) },
        ...requestMetadata(request),
      });
      return {
        allowlist: { id: row.id, active: row.active, maskedPhone: maskedPhone(row.phoneLastFour) },
      };
    },
  };
}
