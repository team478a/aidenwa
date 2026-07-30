import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { UserRole } from '@sales-ai/database';
import {
  appointmentConfirmSchema,
  appointmentHoldSchema,
  appointmentPolicySchema,
  appointmentRescheduleSchema,
  appointmentSlotsSchema,
  appointmentTransitionSchema,
  availabilityExceptionSchema,
  availabilityRuleSchema,
} from '@sales-ai/validation';
import type { AuthContext } from '../../types.js';
import {
  findAppointmentSlots,
  holdAppointment,
  transitionAppointment,
  rescheduleAppointment,
} from './appointment.service.js';
import { requestMetadata, writeAudit } from '../../audit.js';
import { appointmentRoles, appointmentScope, canAccessAssignee } from './appointment.policy.js';
import { createAppointmentRepository } from './appointment.repository.js';
import type { AppointmentRouteDependencies } from './appointment.types.js';

export function registerAppointmentControllers(
  app: FastifyInstance,
  deps: AppointmentRouteDependencies,
) {
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
  app.get('/api/v1/appointment-policies', async (request, reply) => {
    const auth = await deps.authorize(request, reply, roles);
    if (!auth) return;
    return {
      policies: await prisma.appointmentPolicy.findMany({
        where: { organizationId: auth.organizationId },
        orderBy: [{ name: 'asc' }, { version: 'desc' }],
      }),
    };
  });
  app.post('/api/v1/appointment-policies', async (request, reply) => {
    const auth = await mutate(request, reply, [UserRole.admin]);
    if (!auth) return;
    const input = appointmentPolicySchema.parse(request.body);
    const last = await prisma.appointmentPolicy.findFirst({
      where: { organizationId: auth.organizationId, name: input.name },
      orderBy: { version: 'desc' },
    });
    const policy = await prisma.appointmentPolicy.create({
      data: {
        organizationId: auth.organizationId,
        createdBy: auth.userId,
        version: (last?.version ?? 0) + 1,
        ...input,
        validFrom: input.validFrom ? new Date(input.validFrom) : null,
        validUntil: input.validUntil ? new Date(input.validUntil) : null,
      },
    });
    await audit(request, auth, 'appointment_policy.created', 'appointment_policy', policy.id, {
      version: policy.version,
      status: policy.status,
    });
    return reply.code(201).send({ policy });
  });
  for (const action of ['validate', 'publish'] as const)
    app.post(`/api/v1/appointment-policies/:id/${action}`, async (request, reply) => {
      const auth = await mutate(request, reply, [UserRole.admin]);
      if (!auth) return;
      const id = (request.params as { id: string }).id;
      const policy = await prisma.appointmentPolicy.findFirst({
        where: { id, organizationId: auth.organizationId },
      });
      if (!policy) return deps.error(reply, 404, 'NOT_FOUND', 'policyがありません');
      if (action === 'publish')
        await prisma.appointmentPolicy.updateMany({
          where: { organizationId: auth.organizationId, name: policy.name, status: 'published' },
          data: { status: 'archived' },
        });
      return {
        policy: await prisma.appointmentPolicy.update({
          where: { id },
          data:
            action === 'publish'
              ? { status: 'published', publishedBy: auth.userId, publishedAt: new Date() }
              : { status: 'validated' },
        }),
      };
    });
  app.get('/api/v1/availability-rules', async (request, reply) => {
    const auth = await deps.authorize(request, reply, roles);
    if (!auth) return;
    return {
      rules: await prisma.availabilityRule.findMany({
        where: {
          organizationId: auth.organizationId,
          ...(auth.role === UserRole.sales ? { userId: auth.userId } : {}),
        },
      }),
    };
  });
  app.post('/api/v1/availability-rules', async (request, reply) => {
    const auth = await mutate(request, reply, [UserRole.admin, UserRole.manager, UserRole.sales]);
    if (!auth) return;
    const input = availabilityRuleSchema.parse(request.body);
    if (!canAccessAssignee(auth, input.userId))
      return deps.error(reply, 403, 'FORBIDDEN', '自分の勤務時間だけ変更できます');
    const user = await prisma.user.findFirst({
      where: { id: input.userId, organizationId: auth.organizationId },
    });
    if (!user) return deps.error(reply, 404, 'NOT_FOUND', '担当者がありません');
    return reply.code(201).send({
      rule: await prisma.availabilityRule.create({
        data: {
          organizationId: auth.organizationId,
          ...input,
          effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : null,
          effectiveUntil: input.effectiveUntil ? new Date(input.effectiveUntil) : null,
        },
      }),
    });
  });
  app.get('/api/v1/availability-exceptions', async (request, reply) => {
    const auth = await deps.authorize(request, reply, roles);
    if (!auth) return;
    return {
      exceptions: await prisma.availabilityException.findMany({
        where: {
          organizationId: auth.organizationId,
          ...(auth.role === UserRole.sales ? { userId: auth.userId } : {}),
        },
      }),
    };
  });
  app.post('/api/v1/availability-exceptions', async (request, reply) => {
    const auth = await mutate(request, reply);
    if (!auth) return;
    const input = availabilityExceptionSchema.parse(request.body);
    if (!canAccessAssignee(auth, input.userId))
      return deps.error(reply, 403, 'FORBIDDEN', '自分の例外だけ変更できます');
    return reply.code(201).send({
      exception: await prisma.availabilityException.create({
        data: {
          organizationId: auth.organizationId,
          userId: input.userId,
          date: new Date(input.date),
          type: input.type,
          startAt: input.startAt ? new Date(input.startAt) : null,
          endAt: input.endAt ? new Date(input.endAt) : null,
          reasonCode: input.reasonCode,
        },
      }),
    });
  });
  app.get('/api/v1/appointments', async (request, reply) => {
    const auth = await deps.authorize(request, reply, roles);
    if (!auth) return;
    return {
      appointments: await repository.list(auth),
    };
  });
  app.get('/api/v1/appointments/:id', async (request, reply) => {
    const auth = await deps.authorize(request, reply, roles);
    if (!auth) return;
    const id = (request.params as { id: string }).id;
    const appointment = await repository.findScoped(auth, id);
    if (!appointment) return deps.error(reply, 404, 'NOT_FOUND', '予約がありません');
    return {
      appointment,
      events: await repository.listEvents(auth.organizationId, id),
    };
  });
  app.post('/api/v1/appointments/slots', async (request, reply) => {
    const auth = await mutate(request, reply);
    if (!auth) return;
    const input = appointmentSlotsSchema.parse(request.body);
    if (!canAccessAssignee(auth, input.assigneeUserId))
      return deps.error(reply, 403, 'FORBIDDEN', '自分の枠だけ検索できます');
    const slots = await findAppointmentSlots(prisma, {
      organizationId: auth.organizationId,
      policyId: input.policyVersionId,
      userId: input.assigneeUserId,
      from: new Date(input.from),
      to: new Date(input.to),
      timezone: input.confirmedTimezone,
      preferredTimeBand: input.preferredTimeBand,
      secret: env.APPOINTMENT_SLOT_TOKEN_SECRET,
    });
    return { slots };
  });
  app.post('/api/v1/appointments/hold', async (request, reply) => {
    const auth = await mutate(request, reply);
    if (!auth) return;
    const input = appointmentHoldSchema.parse(request.body);
    const body = request.body as { assigneeUserId?: string };
    const assignee = auth.role === UserRole.sales ? auth.userId : body.assigneeUserId;
    if (!assignee) return deps.error(reply, 400, 'VALIDATION_ERROR', '担当者が必要です');
    try {
      const appointment = await holdAppointment(prisma, {
        organizationId: auth.organizationId,
        userId: assignee,
        actorUserId: auth.userId,
        token: input.slotToken,
        secret: env.APPOINTMENT_SLOT_TOKEN_SECRET,
        idempotencyKey: input.idempotencyKey,
        campaignId: input.campaignId,
        companyId: input.companyId,
        ...(input.contactId ? { contactId: input.contactId } : {}),
        ...(input.realtimeSessionId ? { realtimeSessionId: input.realtimeSessionId } : {}),
        ...(input.handoffCardId ? { handoffCardId: input.handoffCardId } : {}),
        ...(input.followupTaskId ? { followupTaskId: input.followupTaskId } : {}),
        confirmationSource: auth.role === UserRole.admin ? 'admin' : 'sales_user',
      });
      return reply.code(201).send({ appointment });
    } catch (cause) {
      return deps.error(
        reply,
        409,
        'SLOT_UNAVAILABLE',
        cause instanceof Error ? cause.message : '利用できません',
      );
    }
  });
  const transition =
    (action: 'confirm' | 'cancel' | 'complete' | 'no_show' | 'request_reschedule') =>
    async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await mutate(request, reply);
      if (!auth) return;
      const id = (request.params as { id: string }).id;
      const parsed =
        action === 'confirm'
          ? appointmentConfirmSchema.parse(request.body)
          : appointmentTransitionSchema.parse(request.body);
      const own = await prisma.appointment.findFirst({ where: appointmentScope(auth, id) });
      if (!own) return deps.error(reply, 404, 'NOT_FOUND', '予約がありません');
      try {
        const appointment = await transitionAppointment(prisma, {
          organizationId: auth.organizationId,
          id,
          version: parsed.version,
          actorUserId: auth.userId,
          action,
          reasonCode: 'confirmationCode' in parsed ? parsed.confirmationCode : parsed.reasonCode,
          ...('customerConfirmed' in parsed ? { customerConfirmed: parsed.customerConfirmed } : {}),
        });
        await audit(request, auth, `appointment.${action}`, 'appointment', id, {
          status: appointment.status,
          version: appointment.version,
        });
        return { appointment };
      } catch (cause) {
        return deps.error(
          reply,
          409,
          'APPOINTMENT_CONFLICT',
          cause instanceof Error ? cause.message : '更新できません',
        );
      }
    };
  app.post('/api/v1/appointments/:id/confirm', transition('confirm'));
  app.post('/api/v1/appointments/:id/cancel', transition('cancel'));
  app.post('/api/v1/appointments/:id/complete', transition('complete'));
  app.post('/api/v1/appointments/:id/no-show', transition('no_show'));
  app.post('/api/v1/appointments/:id/request-reschedule', transition('request_reschedule'));
  app.post('/api/v1/appointments/:id/reschedule', async (request, reply) => {
    const auth = await mutate(request, reply);
    if (!auth) return;
    const id = (request.params as { id: string }).id;
    const input = appointmentRescheduleSchema.parse(request.body);
    const own = await repository.findScoped(auth, id);
    if (!own) return deps.error(reply, 404, 'NOT_FOUND', '予約がありません');
    try {
      return {
        appointment: await rescheduleAppointment(prisma, {
          organizationId: auth.organizationId,
          id,
          version: input.version,
          actorUserId: auth.userId,
          token: input.slotToken,
          secret: env.APPOINTMENT_SLOT_TOKEN_SECRET,
          reasonCode: input.reasonCode,
        }),
      };
    } catch (cause) {
      return deps.error(
        reply,
        409,
        'SLOT_UNAVAILABLE',
        cause instanceof Error ? cause.message : '変更できません',
      );
    }
  });
  app.get('/api/v1/appointment-dashboard', async (request, reply) => {
    const auth = await deps.authorize(request, reply, [UserRole.admin, UserRole.manager]);
    if (!auth) return;
    const grouped = await repository.groupStatus(auth.organizationId);
    const count = (s: string) => grouped.find((x) => x.status === s)?._count ?? 0;
    const held = count('held'),
      confirmed = count('confirmed'),
      completed = count('completed'),
      cancelled = count('cancelled'),
      noShow = count('no_show');
    return {
      held,
      confirmed,
      completed,
      cancelled,
      noShow,
      holdToConfirmedRate: held + confirmed ? confirmed / (held + confirmed) : null,
      completionRate: confirmed + completed ? completed / (confirmed + completed) : null,
      cancellationRate:
        confirmed + completed + cancelled ? cancelled / (confirmed + completed + cancelled) : null,
      noShowRate: confirmed + completed + noShow ? noShow / (confirmed + completed + noShow) : null,
      externalCalls: 0,
    };
  });
}
