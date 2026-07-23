import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@sales-ai/database';
import { hashPassword } from '@sales-ai/shared/security';
import { buildApp } from './app';

const url =
  process.env.DATABASE_URL ??
  'postgresql://sales_ai:sales_ai_dev@localhost:5432/sales_ai?schema=public';
const prisma = new PrismaClient({ datasources: { db: { url } } });
const suffix = `s3-${Date.now().toString(36)}`;
const password = 'Stage3-Test-Password!';
const app = buildApp({ NODE_ENV: 'test', DEFAULT_ORGANIZATION_SLUG: suffix }, { prisma });
let org = '',
  otherOrg = '';
async function login(email: string, slug = suffix) {
  const r = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email, password, organizationSlug: slug },
  });
  const set = r.headers['set-cookie'];
  const values = Array.isArray(set) ? set : [set ?? ''];
  return {
    cookie: values.map((v) => v.split(';')[0]).join('; '),
    csrf: r.json<{ csrfToken: string }>().csrfToken,
  };
}
async function post(
  auth: Awaited<ReturnType<typeof login>>,
  path: string,
  payload: Record<string, unknown> = {},
) {
  return app.inject({
    method: 'POST',
    url: `/api/v1${path}`,
    headers: { cookie: auth.cookie, 'x-csrf-token': auth.csrf },
    payload,
  });
}
beforeAll(async () => {
  const hash = await hashPassword(password);
  org = (await prisma.organization.create({ data: { name: suffix, slug: suffix } })).id;
  otherOrg = (
    await prisma.organization.create({ data: { name: `other-${suffix}`, slug: `other-${suffix}` } })
  ).id;
  await prisma.user.createMany({
    data: [
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
      {
        organizationId: otherOrg,
        name: 'Other',
        email: `admin@other-${suffix}.test`,
        passwordHash: hash,
        role: 'admin',
        status: 'active',
      },
    ],
  });
});
afterAll(async () => {
  await prisma.productVersion.deleteMany({ where: { organizationId: { in: [org, otherOrg] } } });
  await prisma.product.deleteMany({ where: { organizationId: { in: [org, otherOrg] } } });
  await prisma.session.deleteMany({ where: { organizationId: { in: [org, otherOrg] } } });
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: [org, otherOrg] } } });
  await prisma.user.deleteMany({ where: { organizationId: { in: [org, otherOrg] } } });
  await prisma.organization.deleteMany({ where: { id: { in: [org, otherOrg] } } });
  await app.close();
  await prisma.$disconnect();
});
describe('Stage 3 API boundaries', () => {
  it('enforces role/organization boundaries and immutable published versions', async () => {
    const admin = await login(`admin@${suffix}.test`),
      sales = await login(`sales@${suffix}.test`),
      other = await login(`admin@other-${suffix}.test`, `other-${suffix}`);
    expect((await post(sales, '/products', { name: 'Denied', code: 'DENY' })).statusCode).toBe(403);
    const created = await post(admin, '/products', { name: 'Scoped', code: `S-${suffix}` });
    expect(created.statusCode).toBe(201);
    const id = created.json<{ product: { id: string } }>().product.id;
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/v1/products/${id}`,
          headers: { cookie: other.cookie },
        })
      ).statusCode,
    ).toBe(404);
    const version = await post(admin, `/products/${id}/versions`, { summary: 'immutable' });
    const versionId = version.json<{ productVersion: { id: string } }>().productVersion.id;
    expect((await post(admin, `/product-versions/${versionId}/publish`)).statusCode).toBe(200);
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/api/v1/product-versions/${versionId}`,
          headers: { cookie: admin.cookie, 'x-csrf-token': admin.csrf },
          payload: { summary: 'overwrite' },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (await prisma.productVersion.findUniqueOrThrow({ where: { id: versionId } })).summary,
    ).toBe('immutable');
  });
});
