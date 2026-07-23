import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@sales-ai/database';
import { processMockCall, recoverStuckReservations } from './mock-call';

const url =
  process.env.DATABASE_URL ??
  'postgresql://sales_ai:sales_ai_dev@localhost:5432/sales_ai?schema=public';
const prisma = new PrismaClient({ datasources: { db: { url } } });
const suffix = `mock-${Date.now().toString(36)}`;
let org = '',
  user = '',
  company = '',
  phone = '',
  campaign = '',
  target = '';

beforeAll(async () => {
  org = (await prisma.organization.create({ data: { name: suffix, slug: suffix } })).id;
  user = (
    await prisma.user.create({
      data: {
        organizationId: org,
        name: 'Admin',
        email: `${suffix}@test.local`,
        passwordHash: 'unused',
        role: 'admin',
        status: 'active',
      },
    })
  ).id;
  company = (
    await prisma.company.create({
      data: { organizationId: org, name: 'Mock Company', normalizedName: 'mockcompany' },
    })
  ).id;
  phone = (
    await prisma.phoneNumber.create({
      data: {
        organizationId: org,
        companyId: company,
        rawNumber: '050-0000-1111',
        normalizedNumber: '05000001111',
        e164Number: '+815000001111',
        type: 'representative',
        isPrimary: true,
      },
    })
  ).id;
  campaign = (
    await prisma.campaign.create({
      data: {
        organizationId: org,
        name: 'Mock',
        status: 'running',
        callableWeekdays: [0, 1, 2, 3, 4, 5, 6],
        callableStartTime: '00:00',
        callableEndTime: '23:59',
        productVersionId: crypto.randomUUID(),
        aiAgentVersionId: crypto.randomUUID(),
        scenarioVersionId: crypto.randomUUID(),
        salesListId: crypto.randomUUID(),
        createdBy: user,
      },
    })
  ).id;
  target = (
    await prisma.campaignTarget.create({
      data: { organizationId: org, campaignId: campaign, companyId: company, phoneNumberId: phone },
    })
  ).id;
});
afterAll(async () => {
  await prisma.emergencyStop.deleteMany({ where: { organizationId: org } });
  await prisma.callEvent.deleteMany({ where: { organizationId: org } });
  await prisma.callAttempt.deleteMany({ where: { organizationId: org } });
  await prisma.callJob.deleteMany({ where: { organizationId: org } });
  await prisma.campaignTarget.deleteMany({ where: { organizationId: org } });
  await prisma.campaign.deleteMany({ where: { organizationId: org } });
  await prisma.optOut.deleteMany({ where: { organizationId: org } });
  await prisma.phoneNumber.deleteMany({ where: { organizationId: org } });
  await prisma.company.deleteMany({ where: { organizationId: org } });
  await prisma.auditLog.deleteMany({ where: { organizationId: org } });
  await prisma.user.deleteMany({ where: { organizationId: org } });
  await prisma.organization.delete({ where: { id: org } });
  await prisma.$disconnect();
});

describe('Stage 3 mock worker', () => {
  it('rechecks an emergency stop immediately before provider dispatch', async () => {
    const stop = await prisma.emergencyStop.create({
      data: {
        organizationId: org,
        scope: 'organization',
        reason: 'Stage 4A worker test',
        activatedBy: user,
      },
    });
    const job = await prisma.callJob.create({
      data: {
        organizationId: org,
        campaignId: campaign,
        campaignTargetId: target,
        idempotencyKey: `${suffix}:stopped`,
        fixture: 'qualified',
      },
    });
    await processMockCall(prisma, job.id, org);
    expect(await prisma.callJob.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({
      status: 'skipped',
      errorCode: 'emergency_stop_active',
      providerJobId: null,
    });
    expect(await prisma.callAttempt.count({ where: { callJobId: job.id } })).toBe(0);
    await prisma.emergencyStop.update({
      where: { id: stop.id },
      data: {
        active: false,
        releasedBy: user,
        releasedAt: new Date(),
        releaseReason: 'test complete',
      },
    });
  });
  it('applies qualified once when the queue redelivers', async () => {
    const job = await prisma.callJob.create({
      data: {
        organizationId: org,
        campaignId: campaign,
        campaignTargetId: target,
        idempotencyKey: `${suffix}:qualified`,
        fixture: 'qualified',
      },
    });
    await processMockCall(prisma, job.id, org);
    await processMockCall(prisma, job.id, org);
    expect(await prisma.callAttempt.count({ where: { callJobId: job.id } })).toBe(1);
    expect((await prisma.company.findUniqueOrThrow({ where: { id: company } })).salesStatus).toBe(
      'qualified',
    );
  });
  it('registers opt-out and blocks a later job before provider dispatch', async () => {
    await prisma.campaignTarget.update({
      where: { id: target },
      data: { status: 'pending', completedAt: null },
    });
    const opt = await prisma.callJob.create({
      data: {
        organizationId: org,
        campaignId: campaign,
        campaignTargetId: target,
        idempotencyKey: `${suffix}:opt`,
        fixture: 'opt_out',
      },
    });
    await processMockCall(prisma, opt.id, org);
    expect(await prisma.optOut.count({ where: { organizationId: org, status: 'active' } })).toBe(1);
    const later = await prisma.callJob.create({
      data: {
        organizationId: org,
        campaignId: campaign,
        campaignTargetId: target,
        idempotencyKey: `${suffix}:later`,
        fixture: 'qualified',
      },
    });
    await processMockCall(prisma, later.id, org);
    expect((await prisma.callJob.findUniqueOrThrow({ where: { id: later.id } })).errorCode).toBe(
      'opt_out_before_dispatch',
    );
  });
  it('recovers stale reservations', async () => {
    await prisma.campaignTarget.update({
      where: { id: target },
      data: { status: 'reserved', reservedAt: new Date(0) },
    });
    expect(await recoverStuckReservations(prisma, new Date())).toBe(1);
    expect((await prisma.campaignTarget.findUniqueOrThrow({ where: { id: target } })).status).toBe(
      'pending',
    );
  });
});
