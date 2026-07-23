import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@sales-ai/database';
import { hashPassword } from '@sales-ai/shared/security';
import { buildApp } from './app';

const url =
  process.env.DATABASE_URL ??
  'postgresql://sales_ai:sales_ai_dev@localhost:5432/sales_ai?schema=public';
const prisma = new PrismaClient({ datasources: { db: { url } } });
const suffix = `s4-${Date.now().toString(36)}`;
const password = 'Stage4A-Test!';
const secret = 'stage4a-test-webhook-secret';
const app = buildApp(
  { NODE_ENV: 'test', DEFAULT_ORGANIZATION_SLUG: suffix, MOCK_WEBHOOK_SECRET: secret },
  { prisma },
);
let org = '';
async function login(email: string) {
  const r = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email, password, organizationSlug: suffix },
  });
  const set = r.headers['set-cookie'];
  const values = Array.isArray(set) ? set : [set ?? ''];
  return {
    cookie: values.map((v) => v.split(';')[0]).join('; '),
    csrf: r.json<{ csrfToken: string }>().csrfToken,
  };
}
beforeAll(async () => {
  org = (await prisma.organization.create({ data: { name: suffix, slug: suffix } })).id;
  const hash = await hashPassword(password);
  await prisma.user.createMany({
    data: [
      {
        organizationId: org,
        name: 'System',
        email: `system@${suffix}.test`,
        passwordHash: hash,
        role: 'system_admin',
        status: 'active',
      },
      {
        organizationId: org,
        name: 'Admin',
        email: `admin@${suffix}.test`,
        passwordHash: hash,
        role: 'admin',
        status: 'active',
      },
      {
        organizationId: org,
        name: 'Sales',
        email: `sales@${suffix}.test`,
        passwordHash: hash,
        role: 'sales',
        status: 'active',
      },
    ],
  });
});
afterAll(async () => {
  await prisma.providerWebhookEvent.deleteMany({ where: { organizationId: org } });
  await prisma.productionCallPolicy.deleteMany({ where: { organizationId: org } });
  await prisma.auditLog.deleteMany({ where: { organizationId: org } });
  await prisma.session.deleteMany({ where: { organizationId: org } });
  await prisma.user.deleteMany({ where: { organizationId: org } });
  await prisma.organization.delete({ where: { id: org } });
  await app.close();
  await prisma.$disconnect();
});
describe('Stage 4A API safety boundaries', () => {
  it('denies sales changes and permits bounded policy management', async () => {
    const sales = await login(`sales@${suffix}.test`);
    const denied = await app.inject({
      method: 'PUT',
      url: '/api/v1/production-policy',
      headers: { cookie: sales.cookie, 'x-csrf-token': sales.csrf },
      payload: {},
    });
    expect(denied.statusCode).toBe(403);
    const admin = await login(`admin@${suffix}.test`);
    const saved = await app.inject({
      method: 'PUT',
      url: '/api/v1/production-policy',
      headers: { cookie: admin.cookie, 'x-csrf-token': admin.csrf },
      payload: {
        timezone: 'Asia/Tokyo',
        dailyCallLimit: 10,
        hourlyCallLimit: 5,
        concurrentCallLimit: 1,
        maxCallDurationSeconds: 600,
        dailyDurationLimitSeconds: 3600,
        monthlyBudgetMinor: 10000,
        dailyBudgetMinor: 1000,
        currency: 'JPY',
        limitedTestCallLimit: 2,
        mockCostPerCallMinor: 10,
      },
    });
    expect(saved.statusCode).toBe(200);
  });
  it('authenticates, deduplicates and sanitizes mock webhooks', async () => {
    const body = {
      organizationId: org,
      eventId: `event-${suffix}`,
      eventType: 'unknown.safe',
      timestamp: new Date().toISOString(),
      sequenceNumber: 3,
      data: { status: 'queued', phoneNumber: '09012345678', transcript: 'secret conversation' },
    };
    const timestamp = new Date().toISOString();
    const signature = createHmac('sha256', secret)
      .update(`${timestamp}.${JSON.stringify(body)}`)
      .digest('hex');
    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/provider-webhooks/mock',
      headers: { 'x-mock-timestamp': timestamp, 'x-mock-signature': signature },
      payload: body,
    });
    expect(first.statusCode).toBe(202);
    const duplicate = await app.inject({
      method: 'POST',
      url: '/api/v1/provider-webhooks/mock',
      headers: { 'x-mock-timestamp': timestamp, 'x-mock-signature': signature },
      payload: body,
    });
    expect(duplicate.json()).toMatchObject({ accepted: true, duplicate: true });
    const stored = await prisma.providerWebhookEvent.findUniqueOrThrow({
      where: { provider_providerEventId: { provider: 'mock', providerEventId: body.eventId } },
    });
    expect(stored.normalizedData).toEqual({ status: 'queued' });
    const invalid = await app.inject({
      method: 'POST',
      url: '/api/v1/provider-webhooks/mock',
      headers: { 'x-mock-timestamp': timestamp, 'x-mock-signature': '0'.repeat(64) },
      payload: { ...body, eventId: `bad-${suffix}` },
    });
    expect(invalid.statusCode).toBe(401);
  });
});
