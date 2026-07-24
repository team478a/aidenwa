import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@sales-ai/database';
import { FakeTwilioServer, TwilioVoiceProvider } from '@sales-ai/voice-provider';
import type { WorkerEnv } from '@sales-ai/validation';
import {
  expireTwilioAuthorizations,
  reconcileTwilioCosts,
  stopTwilioExecutions,
} from './twilio-call';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://sales_ai:sales_ai_dev@localhost:5432/sales_ai?schema=public';
const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const suffix = `twilio-worker-${Date.now().toString(36)}`;
const fake = new FakeTwilioServer();
const provider = new TwilioVoiceProvider(
  {
    accountSid: 'AC00000000000000000000000000000000',
    apiKeySid: 'SK00000000000000000000000000000000',
    apiKeySecret: 'fake-secret',
    authToken: 'fake-token',
    estimatedCostMinorPerMinute: 100,
    currency: 'JPY',
  },
  fake,
);
const env = {
  NODE_ENV: 'test',
  DATABASE_URL: databaseUrl,
  REDIS_URL: 'redis://127.0.0.1:6379',
  WEB_ORIGIN: 'http://127.0.0.1:3000',
  WORKER_HEALTH_KEY: 'test',
  VOICE_PROVIDER: 'mock',
  PRODUCTION_CALLS_ENABLED: false,
  PRODUCTION_PROVIDER_ALLOWLIST: 'mock',
  RELEASE_COMMIT: 'uncommitted',
  SOURCE_NUMBER_FINGERPRINT_KEY: 'stage4b-test-fingerprint-key',
  MOCK_WEBHOOK_SECRET: 'stage4a-test-mock-secret',
  APPOINTMENT_SLOT_TOKEN_SECRET: 'stage4e-test-slot-token-secret-32',
  TWILIO_MAX_CALL_SECONDS: 120,
  TWILIO_ESTIMATED_COST_MINOR_PER_MINUTE: 100,
  TWILIO_VOICE_NAME: 'Polly.Mizuki',
  MOCK_WORKER_CONCURRENCY: 1,
  STUCK_RESERVATION_MINUTES: 15,
  CALL_EVENT_RETENTION_DAYS: 90,
  OPENAI_REALTIME_MODEL: 'gpt-realtime-mini',
  REALTIME_AI_ENABLED: false,
  TWILIO_MEDIA_STREAMS_ENABLED: false,
  REALTIME_SESSION_MAX_SECONDS: 120,
  REALTIME_MAX_CONCURRENT_SESSIONS: 2,
  REALTIME_EVENT_MAX_BYTES: 65_536,
  REALTIME_TRANSCRIPT_RETENTION_DAYS: 0,
  ZOOM_PHONE_INTEGRATION_ENABLED: false,
  ZOOM_PHONE_OUTBOUND_ENABLED: false,
  ZOOM_PHONE_API_BASE_URL: 'https://api.zoom.us/v2',
  ZOOM_PHONE_SYNC_LOOKBACK_MINUTES: 120,
  REALTIME_CONNECT_TIMEOUT_MS: 10_000,
  REALTIME_IDLE_TIMEOUT_MS: 15_000,
  REALTIME_MAX_PENDING_AUDIO_BYTES: 1_048_576,
  REALTIME_MAX_MESSAGES_PER_SECOND: 100,
  REALTIME_STALE_SESSION_MINUTES: 5,
} satisfies WorkerEnv;
let organizationId = '';

async function fakeCall(key: string) {
  return provider.createProductionCall({
    idempotencyKey: key,
    destinationE164: '+815000000001',
    fromE164: '+815000000099',
    twimlUrl: 'https://voice.example.test/twiml',
    statusCallbackUrl: 'https://voice.example.test/status',
    timeoutSeconds: 20,
    timeLimitSeconds: 120,
    record: false,
  });
}

beforeAll(async () => {
  organizationId = (await prisma.organization.create({ data: { name: suffix, slug: suffix } })).id;
});

afterAll(async () => {
  await prisma.realCallExecution.deleteMany({ where: { organizationId } });
  await prisma.productionTestAuthorization.deleteMany({ where: { organizationId } });
  await prisma.providerConfiguration.deleteMany({ where: { organizationId } });
  await prisma.productionIncident.deleteMany({ where: { organizationId } });
  await prisma.auditLog.deleteMany({ where: { organizationId } });
  await prisma.organization.delete({ where: { id: organizationId } });
  await prisma.$disconnect();
});

describe('Stage 4B-1 emergency-stop Worker with Fake Twilio Server', () => {
  it('cancels queued/ringing calls and ends in-progress calls without redialing', async () => {
    const queued = await fakeCall(`${suffix}:queued`);
    const ringing = await fakeCall(`${suffix}:ringing`);
    const active = await fakeCall(`${suffix}:active`);
    for (const [index, item] of [
      [queued, 'queued'],
      [ringing, 'ringing'],
      [active, 'in_progress'],
    ].entries()) {
      const [call, state] = item as [
        Awaited<ReturnType<typeof fakeCall>>,
        'queued' | 'ringing' | 'in_progress',
      ];
      await prisma.realCallExecution.create({
        data: {
          organizationId,
          authorizationId: crypto.randomUUID(),
          campaignId: crypto.randomUUID(),
          companyId: crypto.randomUUID(),
          phoneNumberId: crypto.randomUUID(),
          allowlistId: crypto.randomUUID(),
          idempotencyKey: `${suffix}:execution:${index}`,
          providerCallId: call.providerCallId,
          providerCallIdFingerprint: 'CA00…0000',
          state,
          estimatedCostMinor: 100,
          reservedCostMinor: 100,
          currency: 'JPY',
        },
      });
    }
    await stopTwilioExecutions(prisma, env, { organizationId, scope: 'organization' }, provider);
    expect(fake.updates).toEqual(
      expect.arrayContaining([
        { sid: queued.providerCallId, status: 'canceled' },
        { sid: ringing.providerCallId, status: 'canceled' },
        { sid: active.providerCallId, status: 'completed' },
      ]),
    );
    expect(
      await prisma.realCallExecution.count({
        where: { organizationId, emergencyCancelStatus: 'confirmed' },
      }),
    ).toBe(3);
    expect(fake.createRequests).toHaveLength(3);
  });

  it('limits a campaign stop to that campaign and completes Fake rollback confirmation', async () => {
    const campaignA = crypto.randomUUID();
    const campaignB = crypto.randomUUID();
    const authorizationId = (
      await prisma.productionTestAuthorization.create({
        data: {
          organizationId,
          status: 'suspended',
          releaseCommit: 'abcdef1',
          writtenApprovalCommit: 'abcdef1',
          startsAt: new Date(Date.now() - 60_000),
          endsAt: new Date(Date.now() + 60_000),
          approvedAllowlistIds: [],
          budgetLimitMinor: 1_000,
          createdBy: crypto.randomUUID(),
          rollbackStatus: 'requested',
        },
      })
    ).id;
    const callA = await fakeCall(`${suffix}:scope-a`);
    const callB = await fakeCall(`${suffix}:scope-b`);
    for (const [call, campaignId, key] of [
      [callA, campaignA, 'a'],
      [callB, campaignB, 'b'],
    ] as const)
      await prisma.realCallExecution.create({
        data: {
          organizationId,
          authorizationId,
          campaignId,
          companyId: crypto.randomUUID(),
          phoneNumberId: crypto.randomUUID(),
          allowlistId: crypto.randomUUID(),
          idempotencyKey: `${suffix}:scope:${key}`,
          providerCallId: call.providerCallId,
          state: 'ringing',
          estimatedCostMinor: 100,
          reservedCostMinor: 100,
          currency: 'JPY',
        },
      });
    const updatesBefore = fake.updates.length;
    await stopTwilioExecutions(
      prisma,
      env,
      { organizationId, scope: 'campaign', scopeId: campaignA },
      provider,
    );
    expect(fake.updates.slice(updatesBefore)).toEqual([
      { sid: callA.providerCallId, status: 'canceled' },
    ]);
    await stopTwilioExecutions(
      prisma,
      env,
      { organizationId, scope: 'campaign', scopeId: campaignB, authorizationId },
      provider,
    );
    expect(
      await prisma.productionTestAuthorization.findUniqueOrThrow({
        where: { id: authorizationId },
      }),
    ).toMatchObject({ rollbackStatus: 'completed' });
  });

  it('expires a finished authorization, cancels reservations and disables the Provider', async () => {
    const authorization = await prisma.productionTestAuthorization.create({
      data: {
        organizationId,
        status: 'active',
        releaseCommit: 'abcdef2',
        writtenApprovalCommit: 'abcdef2',
        startsAt: new Date(Date.now() - 120_000),
        endsAt: new Date(Date.now() - 60_000),
        approvedAllowlistIds: [],
        budgetLimitMinor: 1_000,
        createdBy: crypto.randomUUID(),
      },
    });
    await prisma.providerConfiguration.upsert({
      where: { organizationId_provider: { organizationId, provider: 'twilio' } },
      create: {
        organizationId,
        provider: 'twilio',
        allowed: true,
        productionEnabled: true,
        updatedBy: crypto.randomUUID(),
      },
      update: { productionEnabled: true },
    });
    const execution = await prisma.realCallExecution.create({
      data: {
        organizationId,
        authorizationId: authorization.id,
        campaignId: crypto.randomUUID(),
        companyId: crypto.randomUUID(),
        phoneNumberId: crypto.randomUUID(),
        allowlistId: crypto.randomUUID(),
        idempotencyKey: `${suffix}:expires`,
        state: 'reserved',
        estimatedCostMinor: 100,
        reservedCostMinor: 100,
        currency: 'JPY',
      },
    });
    await expect(expireTwilioAuthorizations(prisma)).resolves.toBeGreaterThanOrEqual(1);
    expect(
      await prisma.productionTestAuthorization.findUniqueOrThrow({
        where: { id: authorization.id },
      }),
    ).toMatchObject({ status: 'expired' });
    expect(
      await prisma.realCallExecution.findUniqueOrThrow({ where: { id: execution.id } }),
    ).toMatchObject({
      state: 'canceled',
    });
    expect(
      await prisma.providerConfiguration.findUniqueOrThrow({
        where: { organizationId_provider: { organizationId, provider: 'twilio' } },
      }),
    ).toMatchObject({ productionEnabled: false });
  });

  it('settles a terminal call cost through Fake Twilio without changing the call result', async () => {
    const call = await fakeCall(`${suffix}:cost`);
    fake.setStatus(call.providerCallId, 'completed', '-1.25', 'jpy');
    const execution = await prisma.realCallExecution.create({
      data: {
        organizationId,
        authorizationId: crypto.randomUUID(),
        campaignId: crypto.randomUUID(),
        companyId: crypto.randomUUID(),
        phoneNumberId: crypto.randomUUID(),
        allowlistId: crypto.randomUUID(),
        idempotencyKey: `${suffix}:cost-execution`,
        providerCallId: call.providerCallId,
        state: 'completed',
        estimatedCostMinor: 200,
        reservedCostMinor: 200,
        currency: 'JPY',
      },
    });
    await expect(
      reconcileTwilioCosts(prisma, env, provider, new Date(), organizationId),
    ).resolves.toBe(1);
    expect(
      await prisma.realCallExecution.findUniqueOrThrow({ where: { id: execution.id } }),
    ).toMatchObject({
      state: 'completed',
      finalCostMinor: 125,
      reservedCostMinor: 125,
      currency: 'JPY',
      costSettlementStatus: 'settled',
      costSettlementAttempts: 1,
    });
  });
});
