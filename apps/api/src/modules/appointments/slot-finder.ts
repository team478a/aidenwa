import type { PrismaClient } from '@sales-ai/database';
import { signSlot } from './slot-token.js';

export function localParts(date: Date, timezone: string) {
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
export function inEffectivePeriod(
  value: Date,
  range: { validFrom?: Date | null; validUntil?: Date | null },
) {
  return (
    (!range.validFrom || range.validFrom <= value) &&
    (!range.validUntil || range.validUntil >= value)
  );
}
export function ruleAppliesOnLocalDate(
  rule: { effectiveFrom: Date | null; effectiveUntil: Date | null },
  localDate: string,
) {
  const from = rule.effectiveFrom?.toISOString().slice(0, 10);
  const until = rule.effectiveUntil?.toISOString().slice(0, 10);
  return (!from || from <= localDate) && (!until || until >= localDate);
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
    if (!inEffectivePeriod(cursor, policy) || !inEffectivePeriod(end, policy)) continue;
    const local = localParts(cursor, input.timezone);
    const endLocal = localParts(end, input.timezone);
    const rule = rules.find(
      (item) =>
        item.weekday === local.weekday &&
        ruleAppliesOnLocalDate(item, local.date) &&
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
    const expiresAt = new Date(Math.min(now.getTime() + 5 * 60_000, cursor.getTime()));
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
