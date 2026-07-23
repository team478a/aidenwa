import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@sales-ai/database';
import { hashPassword } from '@sales-ai/shared/security';
import { signFakeTwilioWebhook } from '@sales-ai/voice-provider';
import { buildApp } from './app';
import { crossedBudgetThresholds } from './stage4b-routes';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://sales_ai:sales_ai_dev@localhost:5432/sales_ai?schema=public';
const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const suffix = `s4b-${Date.now().toString(36)}`;
const authToken = 'stage4b-fake-auth-token';
const publicBase = 'https://voice.example.test';
const app = buildApp(
  {
    NODE_ENV: 'test',
    DEFAULT_ORGANIZATION_SLUG: suffix,
    TWILIO_ACCOUNT_SID: 'AC00000000000000000000000000000000',
    TWILIO_API_KEY_SID: 'SK00000000000000000000000000000000',
    TWILIO_API_KEY_SECRET: 'fake-api-key-secret',
    TWILIO_AUTH_TOKEN: authToken,
    TWILIO_TWIML_BASE_URL: publicBase,
    TWILIO_STATUS_CALLBACK_BASE_URL: publicBase,
  },
  { prisma },
);
let organizationId = '';
let executionId = '';
let allowlistId = '';
let unknownExecutionId = '';
const callSid = `CA${'1'.repeat(32)}`;
const password = 'Stage4B-Fake-Test!';

function form(path: string, body: Record<string, string>, valid = true) {
  const signature = valid
    ? signFakeTwilioWebhook(authToken, `${publicBase}${path}`, body)
    : 'invalid';
  return app.inject({
    method: 'POST',
    url: path,
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'x-twilio-signature': signature,
    },
    payload: new URLSearchParams(body).toString(),
  });
}

async function login(email: string) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email, password, organizationSlug: suffix },
  });
  const cookies = response.headers['set-cookie'];
  const values = Array.isArray(cookies) ? cookies : [cookies ?? ''];
  return {
    cookie: values.map((value) => value.split(';')[0]).join('; '),
    csrf: response.json<{ csrfToken: string }>().csrfToken,
  };
}

beforeAll(async () => {
  organizationId = (await prisma.organization.create({ data: { name: suffix, slug: suffix } })).id;
  const passwordHash = await hashPassword(password);
  await prisma.user.createMany({
    data: [
      {
        organizationId,
        name: 'System',
        email: `system@${suffix}.test`,
        passwordHash,
        role: 'system_admin',
        status: 'active',
      },
      {
        organizationId,
        name: 'Admin',
        email: `admin@${suffix}.test`,
        passwordHash,
        role: 'admin',
        status: 'active',
      },
    ],
  });
  allowlistId = (
    await prisma.testCallAllowlist.create({
      data: {
        organizationId,
        normalizedPhoneNumber: `050${Date.now().toString().slice(-8)}`,
        phoneLastFour: '0001',
        region: 'JP',
        ownerName: 'Fake owner',
        purpose: 'Stage 4B-1 automated test',
        consentConfirmed: true,
        registeredBy: crypto.randomUUID(),
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    })
  ).id;
  executionId = (
    await prisma.realCallExecution.create({
      data: {
        organizationId,
        authorizationId: crypto.randomUUID(),
        campaignId: crypto.randomUUID(),
        companyId: crypto.randomUUID(),
        phoneNumberId: crypto.randomUUID(),
        allowlistId,
        idempotencyKey: `${suffix}:callback`,
        providerCallId: callSid,
        providerCallIdFingerprint: 'CA11…1111',
        estimatedCostMinor: 100,
        reservedCostMinor: 100,
        currency: 'JPY',
      },
    })
  ).id;
  unknownExecutionId = (
    await prisma.realCallExecution.create({
      data: {
        organizationId,
        authorizationId: crypto.randomUUID(),
        campaignId: crypto.randomUUID(),
        companyId: crypto.randomUUID(),
        phoneNumberId: crypto.randomUUID(),
        allowlistId,
        idempotencyKey: `${suffix}:provider-unknown`,
        state: 'provider_unknown',
        providerUnknown: true,
        estimatedCostMinor: 100,
        reservedCostMinor: 100,
        currency: 'JPY',
      },
    })
  ).id;
});

afterAll(async () => {
  await prisma.providerWebhookEvent.deleteMany({ where: { organizationId } });
  await prisma.realCallExecution.deleteMany({ where: { organizationId } });
  await prisma.productionIncident.deleteMany({ where: { organizationId } });
  await prisma.auditLog.deleteMany({ where: { organizationId } });
  await prisma.productionTestAuthorization.deleteMany({ where: { organizationId } });
  await prisma.sourceNumberApproval.deleteMany({ where: { organizationId } });
  await prisma.testCallAllowlist.deleteMany({ where: { organizationId } });
  await prisma.session.deleteMany({ where: { organizationId } });
  await prisma.user.deleteMany({ where: { organizationId } });
  await prisma.organization.delete({ where: { id: organizationId } });
  await app.close();
  await prisma.$disconnect();
});

describe('Stage 4B-1 signed Twilio endpoints', () => {
  it('stores only a source-number fingerprint/last-four and requires system verification', async () => {
    const system = await login(`system@${suffix}.test`);
    const sourceNumber = '+815012345678';
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/source-number-approvals',
      headers: { cookie: system.cookie, 'x-csrf-token': system.csrf },
      payload: {
        sourceNumberE164: sourceNumber,
        ownershipEvidenceRef: 'internal-fake-evidence-001',
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.body).not.toContain(sourceNumber);
    const id = created.json<{ approval: { id: string } }>().approval.id;
    const stored = await prisma.sourceNumberApproval.findUniqueOrThrow({ where: { id } });
    expect(stored.numberLastFour).toBe('5678');
    expect(stored.numberFingerprint).not.toContain(sourceNumber);
    expect(JSON.stringify(stored)).not.toContain(sourceNumber);
    const verified = await app.inject({
      method: 'POST',
      url: `/api/v1/source-number-approvals/${id}/verify`,
      headers: { cookie: system.cookie, 'x-csrf-token': system.csrf },
      payload: { reason: 'Fake所有確認証跡をローカル検証しました' },
    });
    expect(verified.statusCode).toBe(200);
    expect(await prisma.sourceNumberApproval.findUniqueOrThrow({ where: { id } })).toMatchObject({
      verificationStatus: 'verified',
      active: true,
    });
    const auditText = JSON.stringify(
      await prisma.auditLog.findMany({ where: { organizationId, entityId: id } }),
    );
    expect(auditText).not.toContain(sourceNumber);
  });

  it('emits each budget threshold only when it is crossed', () => {
    expect(crossedBudgetThresholds(790, 1_000, 1_000)).toEqual([
      '80_percent',
      '90_percent',
      '100_percent',
    ]);
    expect(crossedBudgetThresholds(810, 850, 1_000)).toEqual([]);
    expect(crossedBudgetThresholds(850, 920, 1_000)).toEqual(['90_percent']);
  });

  it('restricts bounded authorizations to system_admin and active consented allowlists', async () => {
    const payload = {
      releaseCommit: 'abcdef1234567890',
      writtenApprovalCommit: 'abcdef1234567890',
      startsAt: new Date(Date.now() - 60_000).toISOString(),
      endsAt: new Date(Date.now() + 86_400_000).toISOString(),
      maxCalls: 5,
      maxDestinations: 5,
      maxCallSeconds: 120,
      approvedAllowlistIds: [allowlistId],
      budgetLimitMinor: 1_000,
      currency: 'JPY',
      recordingEnabled: false,
      transcriptionEnabled: false,
      mediaStreamsEnabled: false,
      humanTransferEnabled: false,
    };
    const admin = await login(`admin@${suffix}.test`);
    const denied = await app.inject({
      method: 'POST',
      url: '/api/v1/production-test-authorizations',
      headers: { cookie: admin.cookie, 'x-csrf-token': admin.csrf },
      payload,
    });
    expect(denied.statusCode).toBe(403);
    const system = await login(`system@${suffix}.test`);
    const invalid = await app.inject({
      method: 'POST',
      url: '/api/v1/production-test-authorizations',
      headers: { cookie: system.cookie, 'x-csrf-token': system.csrf },
      payload: { ...payload, approvedAllowlistIds: [crypto.randomUUID()] },
    });
    expect(invalid.statusCode).toBe(409);
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/production-test-authorizations',
      headers: { cookie: system.cookie, 'x-csrf-token': system.csrf },
      payload,
    });
    expect(created.statusCode).toBe(201);
    expect(
      created.json<{ authorization: { status: string; maxCalls: number } }>().authorization,
    ).toMatchObject({ status: 'draft', maxCalls: 5 });
  });

  it('resolves provider_unknown without scheduling a redial and records the reason', async () => {
    const system = await login(`system@${suffix}.test`);
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/real-calls/${unknownExecutionId}/resolve-provider-unknown`,
      headers: { cookie: system.cookie, 'x-csrf-token': system.csrf },
      payload: {
        resolution: 'confirmed_not_created',
        reason: 'Fake ProviderでCallが作成されていないことを確認',
      },
    });
    expect(response.statusCode).toBe(200);
    expect(
      await prisma.realCallExecution.findUniqueOrThrow({ where: { id: unknownExecutionId } }),
    ).toMatchObject({ state: 'failed', providerUnknown: false, providerCallId: null });
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { organizationId, action: 'twilio_call.provider_unknown_resolved' },
    });
    expect(audit.afterData).toMatchObject({ redialScheduled: false });
  });

  it('rejects an invalid signature and stores only a sanitized audit record', async () => {
    const path = `/api/v1/twilio/status/${executionId}`;
    const response = await form(
      path,
      { CallSid: callSid, CallStatus: 'ringing', From: '+815000009999', To: '+815000000001' },
      false,
    );
    expect(response.statusCode).toBe(403);
    expect(
      await prisma.productionIncident.count({
        where: { organizationId, category: 'webhook_signature_invalid', status: 'open' },
      }),
    ).toBe(1);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { organizationId, action: 'twilio_webhook.signature_error' },
      orderBy: { occurredAt: 'desc' },
    });
    expect(JSON.stringify(audit)).not.toContain('+815000009999');
    expect(JSON.stringify(audit)).not.toContain('+815000000001');
  });

  it('serves safe TwiML and retries no-input exactly once', async () => {
    const twimlPath = `/api/v1/twilio/twiml/${executionId}`;
    const twiml = await form(twimlPath, { CallSid: callSid });
    expect(twiml.statusCode).toBe(200);
    expect(twiml.headers['content-type']).toContain('application/xml');
    expect(twiml.body).toContain('retry=0');
    expect(twiml.body).not.toMatch(/<(Record|Dial|Connect|Stream)\b/u);

    const firstPath = `/api/v1/twilio/dtmf/${executionId}?retry=0`;
    const first = await form(firstPath, { CallSid: callSid });
    expect(first.body).toContain('入力を確認できませんでした');
    expect(first.body).toContain('retry=1');
    const secondPath = `/api/v1/twilio/dtmf/${executionId}?retry=1`;
    const second = await form(secondPath, { CallSid: callSid });
    expect(second.body).toContain('テストを終了します');
    expect(
      await prisma.realCallExecution.findUniqueOrThrow({ where: { id: executionId } }),
    ).toMatchObject({ dtmfResult: 'test_no_input' });
  });

  it('deduplicates callbacks and never rewinds a terminal state', async () => {
    const path = `/api/v1/twilio/status/${executionId}`;
    const completed = {
      CallSid: callSid,
      CallStatus: 'completed',
      SequenceNumber: '4',
      Price: '-1.25',
      PriceUnit: 'jpy',
      From: '+815000009999',
      To: '+815000000001',
    };
    expect((await form(path, completed)).statusCode).toBe(204);
    expect((await form(path, completed)).statusCode).toBe(204);
    expect(
      (
        await form(path, {
          CallSid: callSid,
          CallStatus: 'ringing',
          SequenceNumber: '2',
        })
      ).statusCode,
    ).toBe(204);
    const execution = await prisma.realCallExecution.findUniqueOrThrow({
      where: { id: executionId },
    });
    expect(execution).toMatchObject({
      state: 'completed',
      finalCostMinor: 125,
      reservedCostMinor: 125,
      currency: 'JPY',
    });
    expect(await prisma.providerWebhookEvent.count({ where: { organizationId } })).toBe(2);
    const stored = await prisma.providerWebhookEvent.findMany({ where: { organizationId } });
    expect(JSON.stringify(stored)).not.toContain('+815000009999');
    expect(JSON.stringify(stored)).not.toContain('+815000000001');
  });

  it('maps DTMF 9 to a technical stop and disables the allowlist transactionally', async () => {
    const response = await form(`/api/v1/twilio/dtmf/${executionId}?retry=0`, {
      CallSid: callSid,
      Digits: '9',
    });
    expect(response.statusCode).toBe(200);
    expect(
      await prisma.realCallExecution.findUniqueOrThrow({ where: { id: executionId } }),
    ).toMatchObject({ dtmfResult: 'test_stop_requested' });
    expect(
      await prisma.testCallAllowlist.findUniqueOrThrow({ where: { id: allowlistId } }),
    ).toMatchObject({ active: false });
  });
});
