import type { FastifyInstance } from 'fastify';
import { UserRole } from '@sales-ai/database';
import {
  appointmentPolicySchema,
  availabilityExceptionSchema,
  availabilityRuleSchema,
} from '@sales-ai/validation';
import { canAccessAssignee } from './appointment.policy.js';
import type { AppointmentControllerContext } from './appointment-controller.context.js';

export function registerAppointmentSettingsControllers(
  app: FastifyInstance,
  context: AppointmentControllerContext,
) {
  const { deps, prisma, roles, mutate, audit } = context;
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
}
