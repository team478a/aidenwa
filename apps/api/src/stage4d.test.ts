import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@sales-ai/database';
import { handoffFinalizeSchema } from '@sales-ai/validation';
import {
  calculateLeadScore,
  fakeHandoffFixture,
  finalizeSalesHandoff,
} from './stage4d-services.js';

const url =
  process.env.DATABASE_URL ??
  'postgresql://sales_ai:sales_ai_dev@localhost:5432/sales_ai?schema=public';
const prisma = new PrismaClient({ datasources: { db: { url } } });
const suffix = `s4d-${Date.now().toString(36)}`;
let organizationId = '';
let otherOrganizationId = '';
let userId = '';
let companyId = '';
let campaignId = '';
let sessionId = '';

function input(fixture = 'hot_callback') {
  return { ...fakeHandoffFixture(fixture), realtimeSessionId: sessionId, companyId };
}

beforeAll(async () => {
  const organization = await prisma.organization.create({ data: { name: suffix, slug: suffix } });
  const other = await prisma.organization.create({
    data: { name: `${suffix}-other`, slug: `${suffix}-other` },
  });
  organizationId = organization.id;
  otherOrganizationId = other.id;
  userId = (
    await prisma.user.create({
      data: {
        organizationId,
        name: 'Admin',
        email: `admin@${suffix}.test`,
        passwordHash: 'not-a-real-secret',
        role: 'admin',
        status: 'active',
      },
    })
  ).id;
  const company = await prisma.company.create({
    data: { organizationId, name: '対象企業', normalizedName: '対象企業' },
  });
  companyId = company.id;
  await prisma.phoneNumber.create({
    data: {
      organizationId,
      companyId,
      rawNumber: '0312345678',
      normalizedNumber: '0312345678',
      type: 'representative',
      isCallable: true,
    },
  });
  campaignId = (
    await prisma.campaign.create({
      data: {
        organizationId,
        name: 'Stage4D',
        productVersionId: randomUUID(),
        aiAgentVersionId: randomUUID(),
        scenarioVersionId: randomUUID(),
        salesListId: randomUUID(),
        createdBy: userId,
      },
    })
  ).id;
  sessionId = (
    await prisma.realtimeCallSession.create({
      data: { organizationId, campaignId, provider: 'fake', status: 'completed' },
    })
  ).id;
});

afterAll(async () => {
  await prisma.salesHandoffFeedback.deleteMany({ where: { organizationId } });
  await prisma.salesHandoffCard.deleteMany({ where: { organizationId } });
  await prisma.humanFollowupTask.deleteMany({ where: { organizationId } });
  await prisma.optOut.deleteMany({ where: { organizationId } });
  await prisma.realtimeCallSession.deleteMany({ where: { organizationId } });
  await prisma.campaign.deleteMany({ where: { organizationId } });
  await prisma.phoneNumber.deleteMany({ where: { organizationId } });
  await prisma.company.deleteMany({ where: { organizationId } });
  await prisma.user.deleteMany({ where: { organizationId } });
  await prisma.organization.deleteMany({
    where: { id: { in: [organizationId, otherOrganizationId] } },
  });
  await prisma.$disconnect();
});

describe('Stage 4D structured sales handoff', () => {
  it('rejects invalid tool values and callback window contradictions', () => {
    expect(() => handoffFinalizeSchema.parse({ ...input(), interestLevel: 'guessed' })).toThrow();
    expect(() =>
      handoffFinalizeSchema.parse({
        ...input(),
        callbackRequested: false,
        callbackWindowCode: 'evening',
      }),
    ).toThrow();
  });
  it('calculates a versioned score on the server and blocks opt-out scoring', () => {
    expect(calculateLeadScore(handoffFinalizeSchema.parse(input())).score).toBe(100);
    const blocked = handoffFinalizeSchema.parse({
      ...input('opt_out'),
      realtimeSessionId: randomUUID(),
    });
    expect(calculateLeadScore(blocked)).toEqual({
      score: null,
      reasons: ['opt_out_blocked'],
      version: 1,
    });
  });
  it('finalizes idempotently, strips a forbidden summary and creates one follow-up', async () => {
    const first = await finalizeSalesHandoff(
      prisma,
      { ...input(), customerNeedSummary: '連絡先 test@example.com' },
      365,
      userId,
    );
    const second = await finalizeSalesHandoff(prisma, input(), 365, userId);
    expect(second.id).toBe(first.id);
    expect(first.customerNeedSummary).toBeNull();
    expect(first.followupTaskId).toBeTruthy();
    expect(
      await prisma.humanFollowupTask.count({
        where: { organizationId, realtimeSessionId: sessionId },
      }),
    ).toBe(1);
  });
  it('rejects cross-organization company ids', async () => {
    const company = await prisma.company.create({
      data: { organizationId: otherOrganizationId, name: '別組織', normalizedName: '別組織' },
    });
    const otherSession = await prisma.realtimeCallSession.create({
      data: { organizationId, campaignId, provider: 'fake', status: 'completed' },
    });
    await expect(
      finalizeSalesHandoff(
        prisma,
        { ...input('warm'), realtimeSessionId: otherSession.id, companyId: company.id },
        365,
        userId,
      ),
    ).rejects.toThrow('HANDOFF_SCOPE_INVALID');
    await prisma.realtimeCallSession.delete({ where: { id: otherSession.id } });
    await prisma.company.delete({ where: { id: company.id } });
  });
  it('never creates a call follow-up from a FAX-only company', async () => {
    const company = await prisma.company.create({
      data: { organizationId, name: 'FAXのみ', normalizedName: 'faxのみ' },
    });
    await prisma.phoneNumber.create({
      data: {
        organizationId,
        companyId: company.id,
        rawNumber: '0311111111',
        normalizedNumber: '0311111111',
        type: 'fax',
        isCallable: false,
      },
    });
    const session = await prisma.realtimeCallSession.create({
      data: { organizationId, campaignId, provider: 'fake', status: 'completed' },
    });
    const card = await finalizeSalesHandoff(
      prisma,
      { ...input(), realtimeSessionId: session.id, companyId: company.id },
      365,
      userId,
    );
    expect(card.followupTaskId).toBeNull();
    await prisma.salesHandoffCard.delete({ where: { id: card.id } });
    await prisma.realtimeCallSession.delete({ where: { id: session.id } });
    await prisma.phoneNumber.deleteMany({ where: { companyId: company.id } });
    await prisma.company.delete({ where: { id: company.id } });
  });
  it('prioritizes opt-out, stores no score and cancels an existing follow-up', async () => {
    const session = await prisma.realtimeCallSession.create({
      data: { organizationId, campaignId, provider: 'fake', status: 'completed' },
    });
    const card = await finalizeSalesHandoff(
      prisma,
      { ...input('opt_out'), realtimeSessionId: session.id },
      365,
      userId,
    );
    expect(card.recommendedNextAction).toBe('block_opt_out');
    expect(card.leadScore).toBeNull();
    expect(
      await prisma.optOut.count({ where: { organizationId, companyId, status: 'active' } }),
    ).toBe(1);
    expect(
      await prisma.humanFollowupTask.count({
        where: { organizationId, status: { notIn: ['completed', 'cancelled'] } },
      }),
    ).toBe(0);
  });
  it('routes low-confidence evaluation to a draft manual review card', async () => {
    const session = await prisma.realtimeCallSession.create({
      data: { organizationId, campaignId, provider: 'fake', status: 'completed' },
    });
    const card = await finalizeSalesHandoff(
      prisma,
      { ...input('low_confidence'), realtimeSessionId: session.id },
      365,
      userId,
    );
    expect(card.status).toBe('draft');
    expect(card.recommendedNextAction).toBe('manual_review');
    expect(card.scoreReasonCodes).toContain('manual_review_required');
  });
});
