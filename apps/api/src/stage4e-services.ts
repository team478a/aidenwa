import { createHmac, timingSafeEqual } from 'node:crypto';
import { Prisma, type PrismaClient } from '@sales-ai/database';

type SlotPayload = {
  organizationId: string;
  userId: string;
  policyId: string;
  start: string;
  end: string;
  timezone: string;
  expires: string;
};
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
export function signSlot(payload: SlotPayload, secret: string) {
  const body = encode(payload);
  const signature = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${signature}`;
}
export function verifySlot(token: string, secret: string): SlotPayload {
  const [body, signature] = token.split('.');
  if (!body || !signature) throw new Error('SLOT_TOKEN_INVALID');
  const expected = createHmac('sha256', secret).update(body).digest();
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    throw new Error('SLOT_TOKEN_INVALID');
  const value = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SlotPayload;
  if (new Date(value.expires) <= new Date()) throw new Error('SLOT_TOKEN_EXPIRED');
  return value;
}
function localParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}`,
    weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday')),
  };
}
export async function findAppointmentSlots(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    policyId: string;
    userId: string;
    from: Date;
    to: Date;
    timezone: string;
    preferredTimeBand: string;
    secret: string;
    now?: Date;
  },
) {
  const now = input.now ?? new Date();
  const [policy, user, rules, exceptions, busy] = await Promise.all([
    prisma.appointmentPolicy.findFirst({
      where: { id: input.policyId, organizationId: input.organizationId, status: 'published' },
    }),
    prisma.user.findFirst({
      where: { id: input.userId, organizationId: input.organizationId, status: 'active' },
    }),
    prisma.availabilityRule.findMany({
      where: {
        organizationId: input.organizationId,
        userId: input.userId,
        timezone: input.timezone,
        active: true,
      },
    }),
    prisma.availabilityException.findMany({
      where: { organizationId: input.organizationId, userId: input.userId },
    }),
    prisma.appointment.findMany({
      where: {
        organizationId: input.organizationId,
        assigneeUserId: input.userId,
        status: { in: ['held', 'confirmed'] },
        busyStartAt: { lt: input.to },
        busyEndAt: { gt: input.from },
      },
    }),
  ]);
  if (!policy || !user || policy.timezone !== input.timezone)
    throw new Error('APPOINTMENT_SCOPE_OR_TIMEZONE_INVALID');
  const earliest = new Date(
    Math.max(input.from.getTime(), now.getTime() + policy.minimumNoticeMinutes * 60_000),
  );
  const latest = new Date(
    Math.min(input.to.getTime(), now.getTime() + policy.maximumAdvanceDays * 86_400_000),
  );
  const slots: Array<{
    startAt: Date;
    endAt: Date;
    token: string;
    timezone: string;
    expiresAt: Date;
  }> = [];
  const cursor = new Date(Math.ceil(earliest.getTime() / 1_800_000) * 1_800_000);
  for (; cursor < latest && slots.length < 3; cursor.setTime(cursor.getTime() + 1_800_000)) {
    const end = new Date(cursor.getTime() + policy.durationMinutes * 60_000);
    if (end > latest) break;
    const local = localParts(cursor, input.timezone);
    const endLocal = localParts(end, input.timezone);
    const rule = rules.find(
      (item) =>
        item.weekday === local.weekday &&
        item.startLocalTime <= local.time &&
        item.endLocalTime >= endLocal.time,
    );
    if (!rule) continue;
    if (input.preferredTimeBand !== 'any') {
      const hour = Number(local.time.slice(0, 2));
      const band = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
      if (band !== input.preferredTimeBand) continue;
    }
    const unavailable = exceptions.some(
      (item) =>
        item.type === 'unavailable' &&
        item.date.toISOString().slice(0, 10) === local.date &&
        (!item.startAt || (item.startAt < end && (item.endAt ?? item.startAt) > cursor)),
    );
    if (unavailable) continue;
    const busyStart = new Date(cursor.getTime() - policy.bufferBeforeMinutes * 60_000);
    const busyEnd = new Date(end.getTime() + policy.bufferAfterMinutes * 60_000);
    if (busy.some((item) => item.busyStartAt < busyEnd && item.busyEndAt > busyStart)) continue;
    const expiresAt = new Date(Math.min(Date.now() + 5 * 60_000, cursor.getTime()));
    slots.push({
      startAt: new Date(cursor),
      endAt: end,
      timezone: input.timezone,
      expiresAt,
      token: signSlot(
        {
          organizationId: input.organizationId,
          userId: input.userId,
          policyId: policy.id,
          start: cursor.toISOString(),
          end: end.toISOString(),
          timezone: input.timezone,
          expires: expiresAt.toISOString(),
        },
        input.secret,
      ),
    });
  }
  return slots;
}
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
  },
) {
  const payload = verifySlot(input.token, input.secret);
  if (payload.organizationId !== input.organizationId || payload.userId !== input.userId)
    throw new Error('SLOT_SCOPE_INVALID');
  const [policy, company, optOut, stop] = await Promise.all([
    prisma.appointmentPolicy.findFirst({
      where: { id: payload.policyId, organizationId: input.organizationId, status: 'published' },
    }),
    prisma.company.findFirst({
      where: { id: input.companyId, organizationId: input.organizationId, isDeleted: false },
    }),
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
  ]);
  if (!policy || !company) throw new Error('APPOINTMENT_SCOPE_INVALID');
  if (optOut) throw new Error('OPT_OUT');
  if (stop) throw new Error('EMERGENCY_STOP_ACTIVE');
  const existing = await prisma.appointment.findUnique({
    where: {
      organizationId_idempotencyKey: {
        organizationId: input.organizationId,
        idempotencyKey: input.idempotencyKey,
      },
    },
  });
  if (existing) return existing;
  const startAt = new Date(payload.start);
  const endAt = new Date(payload.end);
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
          holdExpiresAt: new Date(Date.now() + policy.holdTtlMinutes * 60_000),
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
    action: 'confirm' | 'cancel' | 'complete' | 'no_show';
    reasonCode: string;
    customerConfirmed?: boolean;
  },
) {
  const current = await prisma.appointment.findFirst({
    where: { id: input.id, organizationId: input.organizationId },
  });
  if (!current) throw new Error('APPOINTMENT_NOT_FOUND');
  if (
    input.action === 'confirm' &&
    (!input.customerConfirmed ||
      current.status !== 'held' ||
      !current.holdExpiresAt ||
      current.holdExpiresAt <= new Date())
  )
    throw new Error('APPOINTMENT_CONFIRM_REJECTED');
  const next =
    input.action === 'confirm'
      ? 'confirmed'
      : input.action === 'no_show'
        ? 'no_show'
        : input.action === 'complete'
          ? 'completed'
          : 'cancelled';
  const changed = await prisma.appointment.updateMany({
    where: {
      id: current.id,
      organizationId: input.organizationId,
      version: input.version,
      status:
        input.action === 'confirm'
          ? 'held'
          : { notIn: ['cancelled', 'completed', 'no_show', 'expired'] },
    },
    data: {
      status: next,
      version: { increment: 1 },
      ...(next === 'confirmed' ? { confirmedAt: new Date(), holdExpiresAt: null } : {}),
      ...(next === 'cancelled' ? { cancelledAt: new Date() } : {}),
      ...(['completed', 'no_show'].includes(next) ? { completedAt: new Date() } : {}),
    },
  });
  if (!changed.count) throw new Error('APPOINTMENT_VERSION_CONFLICT');
  const updated = await prisma.appointment.findUniqueOrThrow({ where: { id: current.id } });
  await prisma.$transaction(async (tx) => {
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
  });
  return updated;
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
  },
) {
  const payload = verifySlot(input.token, input.secret);
  const current = await prisma.appointment.findFirst({
    where: { id: input.id, organizationId: input.organizationId },
  });
  if (
    !current ||
    payload.organizationId !== input.organizationId ||
    payload.userId !== current.assigneeUserId ||
    !['confirmed', 'reschedule_requested'].includes(current.status)
  )
    throw new Error('RESCHEDULE_REJECTED');
  const policy = await prisma.appointmentPolicy.findFirst({
    where: { id: payload.policyId, organizationId: input.organizationId, status: 'published' },
  });
  if (!policy) throw new Error('RESCHEDULE_REJECTED');
  const startAt = new Date(payload.start);
  const endAt = new Date(payload.end);
  try {
    return await prisma.$transaction(async (tx) => {
      const changed = await tx.appointment.updateMany({
        where: {
          id: current.id,
          version: input.version,
          status: { in: ['confirmed', 'reschedule_requested'] },
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
      return tx.appointment.findUniqueOrThrow({ where: { id: current.id } });
    });
  } catch (cause) {
    if (cause instanceof Prisma.PrismaClientKnownRequestError) throw new Error('SLOT_CONFLICT');
    throw cause;
  }
}
