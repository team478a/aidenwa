import type { FastifyRequest, FastifyReply } from 'fastify';
import type { UserRole } from '@sales-ai/database';
import { requestMetadata, writeAudit } from '../../audit.js';
import type { AuthContext } from '../../types.js';
import { appointmentRoles } from './appointment.policy.js';
import { createAppointmentRepository } from './appointment.repository.js';
import type { AppointmentRouteDependencies } from './appointment.types.js';

export function createAppointmentControllerContext(deps: AppointmentRouteDependencies) {
  const { prisma, env } = deps;
  const roles = appointmentRoles;
  const repository = createAppointmentRepository(prisma);
  const mutate = async (
    request: FastifyRequest,
    reply: FastifyReply,
    allowed: readonly UserRole[] = roles,
  ) => {
    const auth = await deps.authorize(request, reply, allowed);
    if (!auth || !deps.verifyCsrf(request, reply, auth)) return;
    return auth;
  };
  const audit = (
    request: FastifyRequest,
    auth: AuthContext,
    action: string,
    type: string,
    id: string,
    data: unknown,
  ) =>
    writeAudit(prisma, {
      organizationId: auth.organizationId,
      userId: auth.userId,
      action,
      entityType: type,
      entityId: id,
      afterData: data,
      ...requestMetadata(request),
    });
  return { deps, prisma, env, roles, repository, mutate, audit };
}

export type AppointmentControllerContext = ReturnType<typeof createAppointmentControllerContext>;
