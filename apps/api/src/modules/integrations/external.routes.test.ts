import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@sales-ai/database';
import { registerExternalIntegrationRoutes } from './external.routes.js';
import { hashApiKey, issueApiKey } from './security.js';

const prisma = new PrismaClient();
const suffix = randomUUID().slice(0, 8);
const organizationIds: string[] = [];
const clientIds: string[] = [];
const profileIds: string[] = [];
const executionIds: string[] = [];
const app = Fastify();
let sandboxKey = '';
let otherKey = '';
let productionKey = '';
let sandboxClientId = '';
let sandboxProfileId = '';

const auth = (key: string) => ({ authorization: `Bearer ${key}` });
const actionHeaders = (key: string, idempotencyKey = randomUUID()) => ({
  ...auth(key),
  'idempotency-key': idempotencyKey,
});

async function createExecution(
  integrationClientId: string,
  callProfileId: string,
  organizationId: string,
  status: 'queued' | 'calling' | 'completed',
) {
  const execution = await prisma.externalCallExecution.create({
    data: {
      publicId: `aid_call_${randomUUID().replaceAll('-', '')}`,
      organizationId,
      integrationClientId,
      callProfileId,
      externalCallId: `external-${randomUUID()}`,
      externalCustomerId: `customer-${randomUUID()}`,
      idempotencyKey: randomUUID(),
      requestHash: randomUUID(),
      phoneFingerprint: randomUUID(),
      phoneLast4: '5678',
      status,
      ...(status === 'calling' ? { startedAt: new Date() } : {}),
      ...(status === 'completed'
        ? { startedAt: new Date(), completedAt: new Date(), result: 'qualified' }
        : {}),
    },
  });
  executionIds.push(execution.id);
  return execution;
}

beforeAll(async () => {
  registerExternalIntegrationRoutes(app, {
    prisma,
    phoneFingerprintKey: 'test-phone-fingerprint-key-at-least-32-bytes',
  });
  await app.ready();

  for (const name of ['sandbox', 'other', 'production']) {
    const organization = await prisma.organization.create({
      data: { name: `${name}-${suffix}`, slug: `${name}-${suffix}` },
    });
    organizationIds.push(organization.id);
    const environment = name === 'production' ? 'production' : 'sandbox';
    const issued = issueApiKey(environment);
    const profile = await prisma.callProfile.create({
      data: {
        organizationId: organization.id,
        publicId: `cp_${name}_${suffix}_v1`,
        name,
        environment,
        status: 'active',
        productVersionId: randomUUID(),
        aiAgentVersionId: randomUUID(),
        scenarioVersionId: randomUUID(),
        callableWeekdays: [0, 1, 2, 3, 4, 5, 6],
        callableStartTime: '00:00',
        callableEndTime: '23:59',
        dailyCallLimit: 100,
        concurrentCallLimit: 100,
        createdBy: randomUUID(),
      },
    });
    profileIds.push(profile.id);
    const client = await prisma.integrationClient.create({
      data: {
        organizationId: organization.id,
        name,
        environment,
        apiKeyHash: hashApiKey(issued.apiKey),
        apiKeyPrefix: issued.apiKeyPrefix,
        allowedScopes: [
          'calls:create',
          'calls:read',
          'call-results:read',
          'calls:cancel',
          'calls:stop',
          'call-batches:create',
          'call-batches:read',
        ],
        allowedCallProfiles: [profile.publicId],
        concurrentCallLimit: 100,
        createdBy: randomUUID(),
      },
    });
    clientIds.push(client.id);
    if (name === 'sandbox') {
      sandboxKey = issued.apiKey;
      sandboxClientId = client.id;
      sandboxProfileId = profile.id;
    } else if (name === 'other') otherKey = issued.apiKey;
    else productionKey = issued.apiKey;
  }
});

afterAll(async () => {
  await app.close();
  await prisma.externalIdempotencyRecord.deleteMany({
    where: { integrationClientId: { in: clientIds } },
  });
  await prisma.integrationRateLimitBucket.deleteMany({
    where: { integrationClientId: { in: clientIds } },
  });
  await prisma.outboxEvent.deleteMany({ where: { organizationId: { in: organizationIds } } });
  const webhookEvents = await prisma.externalWebhookEvent.findMany({
    where: { integrationClientId: { in: clientIds } },
    select: { id: true },
  });
  await prisma.externalWebhookDelivery.deleteMany({
    where: { webhookEventId: { in: webhookEvents.map((event) => event.id) } },
  });
  await prisma.externalWebhookEvent.deleteMany({
    where: { id: { in: webhookEvents.map((event) => event.id) } },
  });
  await prisma.externalReference.deleteMany({ where: { integrationClientId: { in: clientIds } } });
  await prisma.externalCallExecution.deleteMany({ where: { id: { in: executionIds } } });
  await prisma.externalCallBatch.deleteMany({ where: { integrationClientId: { in: clientIds } } });
  await prisma.integrationClient.deleteMany({ where: { id: { in: clientIds } } });
  await prisma.callProfile.deleteMany({ where: { id: { in: profileIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  await prisma.$disconnect();
});

describe('external call Phase API-2', () => {
  it('accepts a bounded batch without persisting raw phone numbers and replays by external batch id', async () => {
    const payload = {
      external_batch_id: `batch-${randomUUID()}`,
      call_profile_id: `cp_sandbox_${suffix}_v1`,
      targets: [
        {
          external_call_id: `call-${randomUUID()}`,
          external_customer_id: 'customer-a',
          phone: '0311111111',
          company_name: 'A',
        },
        {
          external_call_id: `call-${randomUUID()}`,
          external_customer_id: 'customer-b',
          phone: '0322222222',
          company_name: 'B',
        },
      ],
    };
    const first = await app.inject({
      method: 'POST',
      url: '/api/external/v1/call-batches',
      headers: actionHeaders(sandboxKey),
      payload,
    });
    const replay = await app.inject({
      method: 'POST',
      url: '/api/external/v1/call-batches',
      headers: actionHeaders(sandboxKey),
      payload,
    });
    expect(first.statusCode).toBe(202);
    expect(first.json()).toEqual(replay.json());
    expect(first.json()).toMatchObject({ accepted: 2, rejected: 0, status: 'accepted' });
    const batch = await prisma.externalCallBatch.findUniqueOrThrow({
      where: { publicId: first.json<{ batch_id: string }>().batch_id },
      include: { calls: true },
    });
    executionIds.push(...batch.calls.map((call) => call.id));
    expect(JSON.stringify(batch.calls)).not.toContain('0311111111');
    expect(
      await prisma.externalReference.count({
        where: {
          integrationClientId: sandboxClientId,
          internalId: { in: batch.calls.map((call) => call.id) },
        },
      }),
    ).toBe(2);
  });

  it('accepts a sandbox call idempotently without storing the raw phone number', async () => {
    const key = randomUUID();
    const payload = {
      external_call_id: `crm-${randomUUID()}`,
      external_customer_id: `customer-${randomUUID()}`,
      call_profile_id: `cp_sandbox_${suffix}_v1`,
      destination: { phone: '0312345678' },
      customer: { company_name: 'Example Company', contact_name: 'Test User' },
      context: { industry: 'manufacturing' },
      execution: { mode: 'immediate' },
    };
    const first = await app.inject({
      method: 'POST',
      url: '/api/external/v1/calls',
      headers: actionHeaders(sandboxKey, key),
      payload,
    });
    const replay = await app.inject({
      method: 'POST',
      url: '/api/external/v1/calls',
      headers: actionHeaders(sandboxKey, key),
      payload,
    });
    expect(first.statusCode).toBe(202);
    expect(first.json()).toEqual(replay.json());
    const responseBody = first.json<{ call_id: string }>();
    const stored = await prisma.externalCallExecution.findUniqueOrThrow({
      where: { publicId: responseBody.call_id },
    });
    executionIds.push(stored.id);
    expect(JSON.stringify(stored)).not.toContain('0312345678');
    expect(stored.phoneLast4).toBe('5678');
    expect(
      await prisma.outboxEvent.count({
        where: { aggregateId: stored.id, eventType: 'external-call' },
      }),
    ).toBe(1);
  });

  it('returns status only to the owning Integration Client', async () => {
    const call = await createExecution(
      sandboxClientId,
      sandboxProfileId,
      organizationIds[0]!,
      'queued',
    );
    const own = await app.inject({
      method: 'GET',
      url: `/api/external/v1/calls/${call.publicId}`,
      headers: auth(sandboxKey),
    });
    const other = await app.inject({
      method: 'GET',
      url: `/api/external/v1/calls/${call.publicId}`,
      headers: auth(otherKey),
    });
    expect(own.statusCode).toBe(200);
    expect(own.json()).toMatchObject({ call_id: call.publicId, status: 'queued' });
    expect(other.statusCode).toBe(404);
  });

  it('returns a standardized completed result and rejects an unfinished result', async () => {
    const completed = await createExecution(
      sandboxClientId,
      sandboxProfileId,
      organizationIds[0]!,
      'completed',
    );
    const queued = await createExecution(
      sandboxClientId,
      sandboxProfileId,
      organizationIds[0]!,
      'queued',
    );
    const result = await app.inject({
      method: 'GET',
      url: `/api/external/v1/calls/${completed.publicId}/result`,
      headers: auth(sandboxKey),
    });
    const unfinished = await app.inject({
      method: 'GET',
      url: `/api/external/v1/calls/${queued.publicId}/result`,
      headers: auth(sandboxKey),
    });
    expect(result.json()).toMatchObject({ status: 'completed', result: 'qualified' });
    expect(unfinished.statusCode).toBe(409);
  });

  it('cancels a queued call idempotently and rejects reuse with another operation', async () => {
    const call = await createExecution(
      sandboxClientId,
      sandboxProfileId,
      organizationIds[0]!,
      'queued',
    );
    const key = randomUUID();
    const first = await app.inject({
      method: 'POST',
      url: `/api/external/v1/calls/${call.publicId}/cancel`,
      headers: actionHeaders(sandboxKey, key),
    });
    const replay = await app.inject({
      method: 'POST',
      url: `/api/external/v1/calls/${call.publicId}/cancel`,
      headers: actionHeaders(sandboxKey, key),
    });
    const conflict = await app.inject({
      method: 'POST',
      url: `/api/external/v1/calls/${call.publicId}/stop`,
      headers: actionHeaders(sandboxKey, key),
    });
    expect(first.json()).toEqual(replay.json());
    expect(first.json()).toMatchObject({ status: 'cancelled' });
    expect(conflict.json()).toMatchObject({ error: { code: 'IDEMPOTENCY_CONFLICT' } });
  });

  it('stops a sandbox call without provider access', async () => {
    const call = await createExecution(
      sandboxClientId,
      sandboxProfileId,
      organizationIds[0]!,
      'calling',
    );
    const response = await app.inject({
      method: 'POST',
      url: `/api/external/v1/calls/${call.publicId}/stop`,
      headers: actionHeaders(sandboxKey),
    });
    expect(response.json()).toMatchObject({ status: 'stopped' });
  });

  it('fails safe as provider_unknown for a production call and never schedules a redial', async () => {
    const productionClientId = clientIds[2]!;
    const call = await createExecution(
      productionClientId,
      profileIds[2]!,
      organizationIds[2]!,
      'calling',
    );
    const response = await app.inject({
      method: 'POST',
      url: `/api/external/v1/calls/${call.publicId}/stop`,
      headers: actionHeaders(productionKey),
    });
    const stored = await prisma.externalCallExecution.findUniqueOrThrow({ where: { id: call.id } });
    const outbox = await prisma.outboxEvent.count({ where: { aggregateId: call.id } });
    expect(response.json()).toMatchObject({ status: 'provider_unknown' });
    expect(stored).toMatchObject({
      status: 'provider_unknown',
      errorCode: 'PROVIDER_STATE_UNKNOWN',
    });
    expect(outbox).toBe(0);
  });

  it('enforces the Integration Client batch rate limit', async () => {
    const now = new Date();
    const windowStartedAt = new Date(Math.floor(now.getTime() / 60_000) * 60_000);
    await prisma.integrationRateLimitBucket.upsert({
      where: {
        integrationClientId_operation_windowStartedAt: {
          integrationClientId: sandboxClientId,
          operation: 'batch',
          windowStartedAt,
        },
      },
      update: { requestCount: 10 },
      create: {
        integrationClientId: sandboxClientId,
        operation: 'batch',
        windowStartedAt,
        requestCount: 10,
      },
    });
    const response = await app.inject({
      method: 'GET',
      url: `/api/external/v1/call-batches/aid_batch_${randomUUID().replaceAll('-', '')}`,
      headers: auth(sandboxKey),
    });
    expect(response.statusCode).toBe(429);
    expect(response.json()).toMatchObject({ error: { code: 'RATE_LIMIT_EXCEEDED' } });
  });
});
