import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@sales-ai/database';
import { appointmentConfirmSchema } from '@sales-ai/validation';
import { FakeCalendarProvider, DisabledCalendarProvider } from '@sales-ai/calendar-provider';
import {
  findAppointmentSlots,
  holdAppointment,
  transitionAppointment,
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
