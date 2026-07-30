import { Prisma, type PrismaClient } from '@sales-ai/database';
import { assertAppointmentTransition, type AppointmentAction } from './appointment-state.js';
import { verifySlot } from './slot-token.js';
import { inEffectivePeriod, localParts, ruleAppliesOnLocalDate } from './slot-finder.js';

export { signSlot, verifySlot } from './slot-token.js';
export { findAppointmentSlots } from './slot-finder.js';

export async function holdAppointment(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    userId: string;
    actorUserId: string;
    token: string;
    secret: string;
    idempotencyKey: string;
    campaignId: string;
    companyId: string;
    contactId?: string;
    realtimeSessionId?: string;
    handoffCardId?: string;
    followupTaskId?: string;
    confirmationSource?: 'fake' | 'sales_user' | 'admin';
    now?: Date;
  },
) {
  const now = input.now ?? new Date();
  const payload = verifySlot(input.token, input.secret, now);
  if (payload.organizationId !== input.organizationId || payload.userId !== input.userId)
    throw new Error('SLOT_SCOPE_INVALID');
  const [policy, assignee, campaign, company, contact, session, card, task, optOut, stop, rules] =
    await Promise.all([
      prisma.appointmentPolicy.findFirst({
        where: { id: payload.policyId, organizationId: input.organizationId, status: 'published' },
      }),
      prisma.user.findFirst({
        where: { id: input.userId, organizationId: input.organizationId, status: 'active' },
        select: { id: true },
      }),
      prisma.campaign.findFirst({
        where: { id: input.campaignId, organizationId: input.organizationId },
        select: { id: true },
      }),
      prisma.company.findFirst({
        where: { id: input.companyId, organizationId: input.organizationId, isDeleted: false },
      }),
      input.contactId
        ? prisma.companyContact.findFirst({
            where: {
              id: input.contactId,
              organizationId: input.organizationId,
              companyId: input.companyId,
              isDeleted: false,
            },
            select: { id: true },
          })
        : Promise.resolve(null),
      input.realtimeSessionId
        ? prisma.realtimeCallSession.findFirst({
            where: { id: input.realtimeSessionId, organizationId: input.organizationId },
            select: { id: true },
          })
        : Promise.resolve(null),
      input.handoffCardId
        ? prisma.salesHandoffCard.findFirst({
            where: { id: input.handoffCardId, organizationId: input.organizationId },
            select: { id: true },
          })
        : Promise.resolve(null),
      input.followupTaskId
        ? prisma.humanFollowupTask.findFirst({
            where: { id: input.followupTaskId, organizationId: input.organizationId },
            select: { id: true },
          })
        : Promise.resolve(null),
      prisma.optOut.findFirst({
        where: {
          organizationId: input.organizationId,
          companyId: input.companyId,
          status: 'active',
          channel: { in: ['all', 'phone'] },
        },
      }),
      prisma.emergencyStop.findFirst({
        where: {
          active: true,
          OR: [
            { scope: 'system' },
            { scope: 'organization', organizationId: input.organizationId },
            { scope: 'campaign', organizationId: input.organizationId, scopeId: input.campaignId },
          ],
        },
      }),
      prisma.availabilityRule.findMany({
        where: {
          organizationId: input.organizationId,
          userId: input.userId,
          timezone: payload.timezone,
          active: true,
        },
      }),
    ]);
  if (
    !policy ||
    !assignee ||
    !campaign ||
    !company ||
    (input.contactId && !contact) ||
    (input.realtimeSessionId && !session) ||
    (input.handoffCardId && !card) ||
    (input.followupTaskId && !task)
  )
    throw new Error('APPOINTMENT_SCOPE_INVALID');
  if (optOut) throw new Error('OPT_OUT');
  if (stop) throw new Error('EMERGENCY_STOP_ACTIVE');
  const startAt = new Date(payload.start);
  const endAt = new Date(payload.end);
  const local = localParts(startAt, payload.timezone);
  const endLocal = localParts(endAt, payload.timezone);
  const rule = rules.find(
    (item) =>
      item.weekday === local.weekday &&
      ruleAppliesOnLocalDate(item, local.date) &&
      item.startLocalTime <= local.time &&
      item.endLocalTime >= endLocal.time,
  );
  if (
    policy.timezone !== payload.timezone ||
    !inEffectivePeriod(startAt, policy) ||
    !inEffectivePeriod(endAt, policy) ||
    endAt.getTime() - startAt.getTime() !== policy.durationMinutes * 60_000 ||
    startAt < new Date(now.getTime() + policy.minimumNoticeMinutes * 60_000) ||
    startAt > new Date(now.getTime() + policy.maximumAdvanceDays * 86_400_000) ||
    !rule
  )
    throw new Error('SLOT_POLICY_INVALID');
  const existing = await prisma.appointment.findUnique({
    where: {
      organizationId_idempotencyKey: {
        organizationId: input.organizationId,
        idempotencyKey: input.idempotencyKey,
      },
    },
  });
  if (existing) return existing;
  try {
    return await prisma.$transaction(async (tx) => {
      const appointment = await tx.appointment.create({
        data: {
          organizationId: input.organizationId,
          campaignId: input.campaignId,
          companyId: input.companyId,
          contactId: input.contactId,
          realtimeSessionId: input.realtimeSessionId,
          handoffCardId: input.handoffCardId,
          followupTaskId: input.followupTaskId,
          assigneeUserId: input.userId,
          policyVersionId: policy.id,
          startAt,
          endAt,
          busyStartAt: new Date(startAt.getTime() - policy.bufferBeforeMinutes * 60_000),
          busyEndAt: new Date(endAt.getTime() + policy.bufferAfterMinutes * 60_000),
          displayTimezone: payload.timezone,
          holdExpiresAt: new Date(now.getTime() + policy.holdTtlMinutes * 60_000),
          confirmationSource: input.confirmationSource ?? 'fake',
          meetingTypeCode: policy.meetingTypeCode,
          idempotencyKey: input.idempotencyKey,
        },
      });
      await tx.appointmentEvent.create({
        data: {
          organizationId: input.organizationId,
          appointmentId: appointment.id,
          type: 'held',
          actorType: 'user',
          actorId: input.actorUserId,
          reasonCode: 'slot_selected',
          afterStatus: 'held',
        },
      });
      return appointment;
    });
  } catch (cause) {
    if (cause instanceof Prisma.PrismaClientKnownRequestError) throw new Error('SLOT_CONFLICT');
    throw cause;
  }
}
export async function transitionAppointment(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    id: string;
    version: number;
    actorUserId: string;
    action: AppointmentAction;
    reasonCode: string;
    customerConfirmed?: boolean;
    now?: Date;
  },
) {
  const now = input.now ?? new Date();
  return prisma.$transaction(async (tx) => {
    const current = await tx.appointment.findFirst({
      where: { id: input.id, organizationId: input.organizationId },
    });
    if (!current) throw new Error('APPOINTMENT_NOT_FOUND');
    const policy = await tx.appointmentPolicy.findFirst({
      where: { id: current.policyVersionId, organizationId: input.organizationId },
      select: { cancellationDeadlineMinutes: true },
    });
    if (!policy) throw new Error('APPOINTMENT_SCOPE_INVALID');
    if (
      input.action === 'confirm' &&
      (!input.customerConfirmed || !current.holdExpiresAt || current.holdExpiresAt <= now)
    )
      throw new Error('APPOINTMENT_CONFIRM_REJECTED');
    const next = assertAppointmentTransition({
      current: current.status,
      action: input.action,
      startAt: current.startAt,
      cancellationDeadlineMinutes: policy.cancellationDeadlineMinutes,
      now,
    });
    const changed = await tx.appointment.updateMany({
      where: {
        id: current.id,
        organizationId: input.organizationId,
        version: input.version,
        status: current.status,
      },
      data: {
        status: next,
        version: { increment: 1 },
        ...(next === 'confirmed' ? { confirmedAt: now, holdExpiresAt: null } : {}),
        ...(next === 'cancelled' ? { cancelledAt: now } : {}),
        ...(['completed', 'no_show'].includes(next) ? { completedAt: now } : {}),
      },
    });
    if (!changed.count) throw new Error('APPOINTMENT_VERSION_CONFLICT');
    const updated = await tx.appointment.findUniqueOrThrow({ where: { id: current.id } });
    await tx.appointmentEvent.create({
      data: {
        organizationId: input.organizationId,
        appointmentId: current.id,
        type: next,
        actorType: 'user',
        actorId: input.actorUserId,
        reasonCode: input.reasonCode,
        beforeStatus: current.status,
        afterStatus: next,
      },
    });
    await tx.followupNotification.upsert({
      where: { dedupeKey: `appointment-${next}:${current.id}:${updated.version}` },
      create: {
        organizationId: input.organizationId,
        userId: current.assigneeUserId,
        taskId: current.followupTaskId,
        type: `appointment_${next}`,
        dedupeKey: `appointment-${next}:${current.id}:${updated.version}`,
      },
      update: {},
    });
    if (next === 'confirmed' && current.handoffCardId)
      await tx.salesHandoffCard.updateMany({
        where: { id: current.handoffCardId, organizationId: input.organizationId },
        data: { appointmentId: current.id },
      });
    if (next === 'confirmed' && current.followupTaskId)
      await tx.humanFollowupTask.updateMany({
        where: { id: current.followupTaskId, organizationId: input.organizationId },
        data: {
          appointmentId: current.id,
          nextActionCode: 'appointment',
          nextActionAt: current.startAt,
        },
      });
    return updated;
  });
}

export async function rescheduleAppointment(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    id: string;
    version: number;
    actorUserId: string;
    token: string;
    secret: string;
    reasonCode: string;
    now?: Date;
  },
) {
  const now = input.now ?? new Date();
  const payload = verifySlot(input.token, input.secret, now);
  const current = await prisma.appointment.findFirst({
    where: { id: input.id, organizationId: input.organizationId },
  });
  if (
    !current ||
    payload.organizationId !== input.organizationId ||
    payload.userId !== current.assigneeUserId ||
    current.status !== 'reschedule_requested'
  )
    throw new Error('RESCHEDULE_REJECTED');
  const [policy, rules] = await Promise.all([
    prisma.appointmentPolicy.findFirst({
      where: { id: payload.policyId, organizationId: input.organizationId, status: 'published' },
    }),
    prisma.availabilityRule.findMany({
      where: {
        organizationId: input.organizationId,
        userId: current.assigneeUserId,
        timezone: payload.timezone,
        active: true,
      },
    }),
  ]);
  if (!policy || policy.timezone !== payload.timezone) throw new Error('RESCHEDULE_REJECTED');
  const startAt = new Date(payload.start);
  const endAt = new Date(payload.end);
  const local = localParts(startAt, payload.timezone);
  const endLocal = localParts(endAt, payload.timezone);
  if (
    !inEffectivePeriod(startAt, policy) ||
    !inEffectivePeriod(endAt, policy) ||
    endAt.getTime() - startAt.getTime() !== policy.durationMinutes * 60_000 ||
    startAt < new Date(now.getTime() + policy.minimumNoticeMinutes * 60_000) ||
    startAt > new Date(now.getTime() + policy.maximumAdvanceDays * 86_400_000) ||
    !rules.some(
      (item) =>
        item.weekday === local.weekday &&
        ruleAppliesOnLocalDate(item, local.date) &&
        item.startLocalTime <= local.time &&
        item.endLocalTime >= endLocal.time,
    )
  )
    throw new Error('RESCHEDULE_REJECTED');
  try {
    return await prisma.$transaction(async (tx) => {
      const changed = await tx.appointment.updateMany({
        where: {
          id: current.id,
          organizationId: input.organizationId,
          version: input.version,
          status: 'reschedule_requested',
        },
        data: {
          startAt,
          endAt,
          busyStartAt: new Date(startAt.getTime() - policy.bufferBeforeMinutes * 60_000),
          busyEndAt: new Date(endAt.getTime() + policy.bufferAfterMinutes * 60_000),
          displayTimezone: payload.timezone,
          status: 'confirmed',
          version: { increment: 1 },
        },
      });
      if (!changed.count) throw new Error('APPOINTMENT_VERSION_CONFLICT');
      await tx.appointmentEvent.create({
        data: {
          organizationId: input.organizationId,
          appointmentId: current.id,
          type: 'rescheduled',
          actorType: 'user',
          actorId: input.actorUserId,
          reasonCode: input.reasonCode,
          beforeStatus: current.status,
          afterStatus: 'confirmed',
          sanitizedMetadata: {
            previousStartAt: current.startAt.toISOString(),
            newStartAt: startAt.toISOString(),
            timezone: payload.timezone,
          },
        },
      });
      await tx.followupNotification.upsert({
        where: { dedupeKey: `appointment-rescheduled:${current.id}:${input.version + 1}` },
        create: {
          organizationId: input.organizationId,
          userId: current.assigneeUserId,
          taskId: current.followupTaskId,
          type: 'appointment_rescheduled',
          dedupeKey: `appointment-rescheduled:${current.id}:${input.version + 1}`,
        },
        update: {},
      });
      if (current.followupTaskId)
        await tx.humanFollowupTask.updateMany({
          where: { id: current.followupTaskId, organizationId: input.organizationId },
          data: { appointmentId: current.id, nextActionCode: 'appointment', nextActionAt: startAt },
        });
      return tx.appointment.findUniqueOrThrow({ where: { id: current.id } });
    });
  } catch (cause) {
    if (cause instanceof Prisma.PrismaClientKnownRequestError) throw new Error('SLOT_CONFLICT');
    throw cause;
  }
}
