import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@sales-ai/database';
import { appointmentConfirmSchema } from '@sales-ai/validation';
import { FakeCalendarProvider, DisabledCalendarProvider } from '@sales-ai/calendar-provider';
import {
  findAppointmentSlots,
  holdAppointment,
  rescheduleAppointment,
  signSlot,
  transitionAppointment,
  verifySlot,
} from './stage4e-services.js';
const url =
  process.env.DATABASE_URL ??
  'postgresql://sales_ai:sales_ai_dev@localhost:5432/sales_ai?schema=public';
const prisma = new PrismaClient({ datasources: { db: { url } } });
const suffix = `s4e-${Date.now().toString(36)}`;
const secret = 'stage4e-test-slot-token-secret-123456789';
let org = '';
let user = '';
let company = '';
let campaign = '';
let policy = '';
let token = '';
beforeAll(async () => {
  org = (await prisma.organization.create({ data: { name: suffix, slug: suffix } })).id;
  user = (
    await prisma.user.create({
      data: {
        organizationId: org,
        name: 'Sales',
        email: `sales@${suffix}.test`,
        passwordHash: 'fake',
        role: 'sales',
        status: 'active',
      },
    })
  ).id;
  company = (
    await prisma.company.create({
      data: { organizationId: org, name: '予約企業', normalizedName: '予約企業' },
    })
  ).id;
  campaign = (
    await prisma.campaign.create({
      data: {
        organizationId: org,
        name: '予約',
        productVersionId: randomUUID(),
        aiAgentVersionId: randomUUID(),
        scenarioVersionId: randomUUID(),
        salesListId: randomUUID(),
        createdBy: user,
      },
    })
  ).id;
  policy = (
    await prisma.appointmentPolicy.create({
      data: {
        organizationId: org,
        name: '標準',
        timezone: 'Asia/Tokyo',
        meetingTypeCode: 'sales_meeting',
        durationMinutes: 30,
        bufferBeforeMinutes: 10,
        bufferAfterMinutes: 10,
        minimumNoticeMinutes: 0,
        maximumAdvanceDays: 30,
        holdTtlMinutes: 10,
        assignmentMode: 'manual',
        status: 'published',
        version: 1,
        createdBy: user,
      },
    })
  ).id;
  await prisma.availabilityRule.createMany({
    data: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
      organizationId: org,
      userId: user,
      timezone: 'Asia/Tokyo',
      weekday,
      startLocalTime: '00:00',
      endLocalTime: '23:59',
    })),
  });
});
afterAll(async () => {
  await prisma.appointmentEvent.deleteMany({ where: { organizationId: org } });
  await prisma.appointment.deleteMany({ where: { organizationId: org } });
  await prisma.availabilityException.deleteMany({ where: { organizationId: org } });
  await prisma.availabilityRule.deleteMany({ where: { organizationId: org } });
  await prisma.appointmentPolicy.deleteMany({ where: { organizationId: org } });
  await prisma.optOut.deleteMany({ where: { organizationId: org } });
  await prisma.campaign.deleteMany({ where: { organizationId: org } });
  await prisma.company.deleteMany({ where: { organizationId: org } });
  await prisma.user.deleteMany({ where: { organizationId: org } });
  await prisma.organization.delete({ where: { id: org } });
  await prisma.$disconnect();
});
describe('Stage 4E internal appointment ledger', () => {
  it('uses only Fake/Internal providers and fails closed when disabled', async () => {
    expect((await new FakeCalendarProvider().health()).external).toBe(false);
    await expect(new DisabledCalendarProvider().createEvent()).rejects.toThrow(
      'CALENDAR_INTEGRATION_DISABLED',
    );
  });
  it('deterministically returns at most three signed slots', async () => {
    const from = new Date(Date.now() + 86_400_000);
    const slots = await findAppointmentSlots(prisma, {
      organizationId: org,
      policyId: policy,
      userId: user,
      from,
      to: new Date(from.getTime() + 2 * 86_400_000),
      timezone: 'Asia/Tokyo',
      preferredTimeBand: 'morning',
      secret,
    });
    expect(slots.length).toBe(3);
    expect(slots.every((s) => s.timezone === 'Asia/Tokyo')).toBe(true);
    token = slots[0]!.token;
  });
  it('handles a DST boundary without duplicate UTC instants', async () => {
    const dstPolicy = await prisma.appointmentPolicy.create({
      data: {
        organizationId: org,
        name: 'DST',
        timezone: 'America/New_York',
        meetingTypeCode: 'sales_meeting',
        durationMinutes: 30,
        minimumNoticeMinutes: 0,
        maximumAdvanceDays: 30,
        holdTtlMinutes: 10,
        assignmentMode: 'manual',
        status: 'published',
        version: 1,
        createdBy: user,
      },
    });
    await prisma.availabilityRule.createMany({
      data: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
        organizationId: org,
        userId: user,
        timezone: 'America/New_York',
        weekday,
        startLocalTime: '00:00',
        endLocalTime: '23:59',
      })),
    });
    const slots = await findAppointmentSlots(prisma, {
      organizationId: org,
      policyId: dstPolicy.id,
      userId: user,
      from: new Date('2026-11-01T04:00:00Z'),
      to: new Date('2026-11-01T10:00:00Z'),
      timezone: 'America/New_York',
      preferredTimeBand: 'any',
      secret,
      now: new Date('2026-10-31T00:00:00Z'),
    });
    expect(new Set(slots.map((slot) => slot.startAt.toISOString())).size).toBe(slots.length);
    expect(slots.length).toBeGreaterThan(0);
  });
  it('rejects signed slot payloads with an invalid shape, timezone, or time order', () => {
    const base = {
      organizationId: org,
      userId: user,
      policyId: policy,
      start: '2026-07-25T10:30:00.000Z',
      end: '2026-07-25T10:00:00.000Z',
      timezone: 'Invalid/Timezone',
      expires: '2026-07-25T09:00:00.000Z',
    };
    expect(() =>
      verifySlot(signSlot(base, secret), secret, new Date('2026-07-25T08:00:00.000Z')),
    ).toThrow('SLOT_TOKEN_INVALID');
  });
  it('does not generate slots outside policy or availability effective periods', async () => {
    const now = new Date('2026-07-24T00:00:00.000Z');
    const from = new Date('2026-07-26T00:00:00.000Z');
    const input = {
      organizationId: org,
      policyId: policy,
      userId: user,
      from,
      to: new Date('2026-07-27T00:00:00.000Z'),
      timezone: 'Asia/Tokyo',
      preferredTimeBand: 'any',
      secret,
      now,
    } as const;
    await prisma.appointmentPolicy.update({
      where: { id: policy },
      data: { validFrom: new Date('2026-08-01T00:00:00.000Z') },
    });
    expect(await findAppointmentSlots(prisma, input)).toHaveLength(0);
    await prisma.appointmentPolicy.update({
      where: { id: policy },
      data: { validFrom: null },
    });
    await prisma.availabilityRule.updateMany({
      where: { organizationId: org, timezone: 'Asia/Tokyo' },
      data: { effectiveFrom: new Date('2026-08-01T00:00:00.000Z') },
    });
    expect(await findAppointmentSlots(prisma, input)).toHaveLength(0);
    await prisma.availabilityRule.updateMany({
      where: { organizationId: org, timezone: 'Asia/Tokyo' },
      data: { effectiveFrom: null },
    });
  });
  it('lets only one concurrent hold win and keeps idempotency', async () => {
    const base = {
      organizationId: org,
      userId: user,
      actorUserId: user,
      token,
      secret,
      campaignId: campaign,
      companyId: company,
    };
    const results = await Promise.allSettled([
      holdAppointment(prisma, { ...base, idempotencyKey: 'hold-concurrent-1' }),
      holdAppointment(prisma, { ...base, idempotencyKey: 'hold-concurrent-2' }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const winner = results.find((r) => r.status === 'fulfilled') as PromiseFulfilledResult<
      Awaited<ReturnType<typeof holdAppointment>>
    >;
    const same = await holdAppointment(prisma, {
      ...base,
      idempotencyKey: winner.value.idempotencyKey,
    });
    expect(same.id).toBe(winner.value.id);
  });
  it('requires explicit confirmation and uses optimistic versioning', async () => {
    expect(() =>
      appointmentConfirmSchema.parse({
        version: 0,
        customerConfirmed: false,
        confirmationCode: 'confirmed',
      }),
    ).toThrow();
    const held = await prisma.appointment.findFirstOrThrow({
      where: { organizationId: org, status: 'held' },
    });
    const confirmed = await transitionAppointment(prisma, {
      organizationId: org,
      id: held.id,
      version: held.version,
      actorUserId: user,
      action: 'confirm',
      reasonCode: 'customer_confirmed',
      customerConfirmed: true,
    });
    expect(confirmed.status).toBe('confirmed');
    await expect(
      transitionAppointment(prisma, {
        organizationId: org,
        id: held.id,
        version: held.version,
        actorUserId: user,
        action: 'cancel',
        reasonCode: 'stale',
      }),
    ).rejects.toThrow('APPOINTMENT_VERSION_CONFLICT');
  });
  it('uses an explicit reschedule-request state before applying a new slot', async () => {
    const current = await prisma.appointment.findFirstOrThrow({
      where: { organizationId: org, status: 'confirmed' },
    });
    const requested = await transitionAppointment(prisma, {
      organizationId: org,
      id: current.id,
      version: current.version,
      actorUserId: user,
      action: 'request_reschedule',
      reasonCode: 'customer_requested',
    });
    expect(requested.status).toBe('reschedule_requested');
    const rescheduled = await rescheduleAppointment(prisma, {
      organizationId: org,
      id: requested.id,
      version: requested.version,
      actorUserId: user,
      token,
      secret,
      reasonCode: 'new_slot_selected',
    });
    expect(rescheduled.status).toBe('confirmed');
    expect(
      await prisma.appointmentEvent.count({
        where: { appointmentId: current.id, type: { in: ['reschedule_requested', 'rescheduled'] } },
      }),
    ).toBe(2);
  });
  it('rejects a late cancellation without separating the appointment and event', async () => {
    const now = new Date();
    const startAt = new Date(now.getTime() + 30 * 60_000);
    const late = await prisma.appointment.create({
      data: {
        organizationId: org,
        campaignId: campaign,
        companyId: company,
        assigneeUserId: user,
        policyVersionId: policy,
        status: 'confirmed',
        startAt,
        endAt: new Date(startAt.getTime() + 30 * 60_000),
        busyStartAt: startAt,
        busyEndAt: new Date(startAt.getTime() + 30 * 60_000),
        displayTimezone: 'Asia/Tokyo',
        confirmationSource: 'sales_user',
        meetingTypeCode: 'sales_meeting',
        idempotencyKey: `late-cancel-${suffix}`,
      },
    });
    await expect(
      transitionAppointment(prisma, {
        organizationId: org,
        id: late.id,
        version: late.version,
        actorUserId: user,
        action: 'cancel',
        reasonCode: 'too_late',
        now,
      }),
    ).rejects.toThrow('APPOINTMENT_CANCELLATION_DEADLINE_PASSED');
    expect(await prisma.appointment.findUniqueOrThrow({ where: { id: late.id } })).toMatchObject({
      status: 'confirmed',
      version: 0,
    });
    expect(await prisma.appointmentEvent.count({ where: { appointmentId: late.id } })).toBe(0);
    await prisma.appointment.delete({ where: { id: late.id } });
  });
  it('allows only one concurrent transition and creates exactly one event', async () => {
    const now = new Date();
    const startAt = new Date(now.getTime() + 10 * 86_400_000);
    const held = await prisma.appointment.create({
      data: {
        organizationId: org,
        campaignId: campaign,
        companyId: company,
        assigneeUserId: user,
        policyVersionId: policy,
        startAt,
        endAt: new Date(startAt.getTime() + 30 * 60_000),
        busyStartAt: startAt,
        busyEndAt: new Date(startAt.getTime() + 30 * 60_000),
        displayTimezone: 'Asia/Tokyo',
        holdExpiresAt: new Date(now.getTime() + 10 * 60_000),
        confirmationSource: 'sales_user',
        meetingTypeCode: 'sales_meeting',
        idempotencyKey: `transition-race-${suffix}`,
      },
    });
    const result = await Promise.allSettled([
      transitionAppointment(prisma, {
        organizationId: org,
        id: held.id,
        version: 0,
        actorUserId: user,
        action: 'confirm',
        reasonCode: 'customer_confirmed',
        customerConfirmed: true,
        now,
      }),
      transitionAppointment(prisma, {
        organizationId: org,
        id: held.id,
        version: 0,
        actorUserId: user,
        action: 'confirm',
        reasonCode: 'customer_confirmed',
        customerConfirmed: true,
        now,
      }),
    ]);
    expect(result.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.appointmentEvent.count({ where: { appointmentId: held.id } })).toBe(1);
  });
  it('rolls back the appointment update when event creation fails', async () => {
    const now = new Date();
    const startAt = new Date(now.getTime() + 12 * 86_400_000);
    const held = await prisma.appointment.create({
      data: {
        organizationId: org,
        campaignId: campaign,
        companyId: company,
        assigneeUserId: user,
        policyVersionId: policy,
        startAt,
        endAt: new Date(startAt.getTime() + 30 * 60_000),
        busyStartAt: startAt,
        busyEndAt: new Date(startAt.getTime() + 30 * 60_000),
        displayTimezone: 'Asia/Tokyo',
        holdExpiresAt: new Date(now.getTime() + 10 * 60_000),
        confirmationSource: 'sales_user',
        meetingTypeCode: 'sales_meeting',
        idempotencyKey: `transition-rollback-${suffix}`,
      },
    });
    const failing = prisma.$extends({
      query: {
        appointmentEvent: {
          create() {
            throw new Error('EVENT_WRITE_FAILED');
          },
        },
      },
    });
    await expect(
      transitionAppointment(failing as unknown as PrismaClient, {
        organizationId: org,
        id: held.id,
        version: 0,
        actorUserId: user,
        action: 'confirm',
        reasonCode: 'customer_confirmed',
        customerConfirmed: true,
        now,
      }),
    ).rejects.toThrow('EVENT_WRITE_FAILED');
    expect(await prisma.appointment.findUniqueOrThrow({ where: { id: held.id } })).toMatchObject({
      status: 'held',
      version: 0,
    });
    expect(await prisma.appointmentEvent.count({ where: { appointmentId: held.id } })).toBe(0);
  });
  it('rejects a company id owned by another organization', async () => {
    const other = await prisma.organization.create({
      data: { name: `${suffix}-other`, slug: `${suffix}-other` },
    });
    const otherCompany = await prisma.company.create({
      data: { organizationId: other.id, name: '別組織', normalizedName: '別組織' },
    });
    try {
      await expect(
        holdAppointment(prisma, {
          organizationId: org,
          userId: user,
          actorUserId: user,
          token,
          secret,
          idempotencyKey: `cross-tenant-${suffix}`,
          campaignId: campaign,
          companyId: otherCompany.id,
        }),
      ).rejects.toThrow('APPOINTMENT_SCOPE_INVALID');
    } finally {
      await prisma.company.delete({ where: { id: otherCompany.id } });
      await prisma.organization.delete({ where: { id: other.id } });
    }
  });
  it('rejects booking after organization opt-out', async () => {
    await prisma.optOut.create({
      data: {
        organizationId: org,
        companyId: company,
        scope: 'company',
        channel: 'all',
        reasonCode: 'customer_request',
        status: 'active',
        registeredBy: user,
      },
    });
    const from = new Date(Date.now() + 3 * 86_400_000);
    const [slot] = await findAppointmentSlots(prisma, {
      organizationId: org,
      policyId: policy,
      userId: user,
      from,
      to: new Date(from.getTime() + 86_400_000),
      timezone: 'Asia/Tokyo',
      preferredTimeBand: 'any',
      secret,
    });
    await expect(
      holdAppointment(prisma, {
        organizationId: org,
        userId: user,
        actorUserId: user,
        token: slot!.token,
        secret,
        idempotencyKey: 'blocked-optout',
        campaignId: campaign,
        companyId: company,
      }),
    ).rejects.toThrow('OPT_OUT');
  });
});
