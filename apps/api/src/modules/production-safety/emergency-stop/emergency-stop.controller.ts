import type { FastifyReply, FastifyRequest } from 'fastify';
import { reasonSchema, stopSchema } from '@sales-ai/validation';

import { requestMetadata, writeAudit } from '../../../audit.js';
import type { ProductControllerDependencies } from '../../products/product.controller.js';
import {
  canActivateSystemStop,
  emergencyStopActivationRoles,
  emergencyStopReadRoles,
  emergencyStopReleaseRoles,
  resolveStopOrganization,
} from './emergency-stop.policy.js';
import {
  findEmergencyStop,
  listEmergencyStops,
  releaseEmergencyStop,
} from './emergency-stop.repository.js';
import { activateEmergencyStop } from './emergency-stop.service.js';

export type EmergencyStopControllerDependencies = ProductControllerDependencies;

export function createEmergencyStopController(deps: EmergencyStopControllerDependencies) {
  return {
    list: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await deps.authorize(request, reply, emergencyStopReadRoles);
      if (!auth) return;
      return { stops: await listEmergencyStops(deps.prisma, auth) };
    },
    activate: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await deps.authorize(request, reply, emergencyStopActivationRoles);
      if (!auth || !deps.verifyCsrf(request, reply, auth)) return;
      const parsed = stopSchema.safeParse(request.body);
      if (!parsed.success) return deps.error(reply, 400, 'VALIDATION_ERROR', parsed.error.message);
      if (parsed.data.scope === 'system' && !canActivateSystemStop(auth.role))
        return deps.error(reply, 403, 'FORBIDDEN', 'システム停止はシステム管理者のみ実行できます');
      const organizationId = resolveStopOrganization(
        auth,
        parsed.data.scope,
        parsed.data.organizationId,
      );
      const stop = await activateEmergencyStop(
        deps.prisma,
        organizationId,
        auth.userId,
        parsed.data,
      );
      await writeAudit(deps.prisma, {
        organizationId: organizationId ?? auth.organizationId,
        userId: auth.userId,
        action: 'emergency_stop.activated',
        entityType: 'emergency_stop',
        entityId: stop.id,
        afterData: { scope: stop.scope, scopeId: stop.scopeId, reason: stop.reason },
        ...requestMetadata(request),
      });
      return reply.code(201).send({ stop });
    },
    release: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await deps.authorize(request, reply, emergencyStopReleaseRoles);
      if (!auth || !deps.verifyCsrf(request, reply, auth)) return;
      const parsed = reasonSchema.safeParse(request.body);
      if (!parsed.success) return deps.error(reply, 400, 'REASON_REQUIRED', '解除理由が必要です');
      const id = (request.params as { id: string }).id;
      const before = await findEmergencyStop(deps.prisma, id);
      if (!before?.active) return deps.error(reply, 404, 'NOT_FOUND', '有効な停止がありません');
      const stop = await releaseEmergencyStop(deps.prisma, id, auth.userId, parsed.data.reason);
      await writeAudit(deps.prisma, {
        organizationId: before.organizationId ?? auth.organizationId,
        userId: auth.userId,
        action: 'emergency_stop.released',
        entityType: 'emergency_stop',
        entityId: id,
        afterData: { reason: parsed.data.reason },
        ...requestMetadata(request),
      });
      return { stop };
    },
  };
}
