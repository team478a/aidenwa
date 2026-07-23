import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient, UserRole, UserStatus } from '@sales-ai/database';
import { hashPassword } from '@sales-ai/shared/security';
import { buildApp } from './app';
import { writeAudit } from './audit';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://sales_ai:sales_ai_dev@localhost:5432/sales_ai?schema=public';
const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const suffix = Date.now().toString(36);
const password = 'Stage1-Test-Password!';
let organizationId = '';
let otherOrganizationId = '';
let adminId = '';
let managerId = '';
let salesId = '';
let suspendedId = '';
let otherUserId = '';
let teamId = '';
let otherTeamId = '';
const app = buildApp({ NODE_ENV: 'test', DEFAULT_ORGANIZATION_SLUG: `test-${suffix}` }, { prisma });

type Auth = { cookie: string; csrf: string };
type InjectResponse = {
  statusCode: number;
  json(): unknown;
};
async function login(email: string, organizationSlug = `test-${suffix}`, inputPassword = password) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email, password: inputPassword, organizationSlug },
  });
  const setCookie = response.headers['set-cookie'];
  const values = Array.isArray(setCookie) ? setCookie : [setCookie ?? ''];
  const responseBody: unknown = response.json();
  return {
    response,
    auth: {
      cookie: values.map((value) => value.split(';')[0]).join('; '),
      csrf:
        responseBody && typeof responseBody === 'object' && 'csrfToken' in responseBody
          ? String(responseBody.csrfToken)
          : '',
    },
  };
}
async function mutation(
  auth: Auth,
  method: 'POST' | 'PATCH',
  url: string,
  payload?: Record<string, unknown>,
): Promise<InjectResponse> {
  const headers = { cookie: auth.cookie, 'x-csrf-token': auth.csrf };
  if (payload === undefined) return app.inject({ method, url, headers });
  return app.inject({ method, url, headers, payload });
}

beforeAll(async () => {
  const passwordHash = await hashPassword(password);
  const organization = await prisma.organization.create({
    data: { name: 'Test Org', slug: `test-${suffix}` },
  });
  organizationId = organization.id;
  const other = await prisma.organization.create({
    data: { name: 'Other Org', slug: `other-${suffix}` },
  });
  otherOrganizationId = other.id;
  const [team, otherTeam] = await Promise.all([
    prisma.team.create({ data: { organizationId, name: `Team ${suffix}` } }),
    prisma.team.create({ data: { organizationId: other.id, name: `Other Team ${suffix}` } }),
  ]);
  teamId = team.id;
  otherTeamId = otherTeam.id;
  const [admin, manager, sales, suspended, otherUser] = await Promise.all([
    prisma.user.create({
      data: {
        organizationId,
        name: 'Admin',
        email: `admin-${suffix}@example.test`,
        passwordHash,
        role: UserRole.admin,
        status: UserStatus.active,
      },
    }),
    prisma.user.create({
      data: {
        organizationId,
        name: 'Manager',
        email: `manager-${suffix}@example.test`,
        passwordHash,
        role: UserRole.manager,
        status: UserStatus.active,
      },
    }),
    prisma.user.create({
      data: {
        organizationId,
        name: 'Sales',
        email: `sales-${suffix}@example.test`,
        passwordHash,
        role: UserRole.sales,
        status: UserStatus.active,
      },
    }),
    prisma.user.create({
      data: {
        organizationId,
        name: 'Suspended',
        email: `suspended-${suffix}@example.test`,
        passwordHash,
        role: UserRole.sales,
        status: UserStatus.suspended,
      },
    }),
    prisma.user.create({
      data: {
        organizationId: other.id,
        name: 'Other',
        email: `other-${suffix}@example.test`,
        passwordHash,
        role: UserRole.sales,
        status: UserStatus.active,
      },
    }),
  ]);
  adminId = admin.id;
  managerId = manager.id;
  salesId = sales.id;
  suspendedId = suspended.id;
  otherUserId = otherUser.id;
});

afterAll(async () => {
  await prisma.session.deleteMany({
    where: { organizationId: { in: [organizationId, otherOrganizationId] } },
  });
  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        { organizationId: { in: [organizationId, otherOrganizationId] } },
        { entityId: { in: [adminId, managerId, salesId, suspendedId, otherUserId] } },
      ],
    },
  });
  await prisma.user.deleteMany({
    where: { organizationId: { in: [organizationId, otherOrganizationId] } },
  });
  await prisma.team.deleteMany({
    where: { organizationId: { in: [organizationId, otherOrganizationId] } },
  });
  await prisma.organization.deleteMany({
    where: { id: { in: [organizationId, otherOrganizationId] } },
  });
  await app.close();
  await prisma.$disconnect();
});

describe('Stage 1 authentication and authorization', () => {
  it('logs in with correct credentials and rejects a wrong password', async () => {
    const success = await login(`admin-${suffix}@example.test`);
    expect(success.response.statusCode).toBe(200);
    expect(JSON.stringify(success.response.headers['set-cookie'])).toContain('HttpOnly');
    const failed = await login(`admin-${suffix}@example.test`, `test-${suffix}`, 'Wrong-Password!');
    expect(failed.response.statusCode).toBe(401);
  });
  it('rejects suspended users', async () => {
    expect((await login(`suspended-${suffix}@example.test`)).response.statusCode).toBe(401);
  });
  it('invalidates the session after logout', async () => {
    const { auth } = await login(`sales-${suffix}@example.test`);
    expect((await mutation(auth, 'POST', '/api/v1/auth/logout')).statusCode).toBe(204);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/auth/me',
          headers: { cookie: auth.cookie },
        })
      ).statusCode,
    ).toBe(401);
  });
  it('prevents sales from creating users and managers from changing organization settings', async () => {
    const sales = (await login(`sales-${suffix}@example.test`)).auth;
    const manager = (await login(`manager-${suffix}@example.test`)).auth;
    expect(
      (
        await mutation(sales, 'POST', '/api/v1/users', {
          name: 'No',
          email: `no-${suffix}@example.test`,
          password,
          role: 'sales',
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (await mutation(manager, 'PATCH', '/api/v1/organization', { name: 'No' })).statusCode,
    ).toBe(403);
  });
  it('prevents managers from administering teams or assigning a cross-organization team', async () => {
    const manager = (await login(`manager-${suffix}@example.test`)).auth;
    expect(
      (await mutation(manager, 'POST', '/api/v1/teams', { name: 'Unauthorized Team' })).statusCode,
    ).toBe(403);
    expect(
      (await mutation(manager, 'PATCH', `/api/v1/teams/${teamId}`, { name: 'Unauthorized' }))
        .statusCode,
    ).toBe(403);
    expect(
      (
        await mutation(manager, 'PATCH', `/api/v1/users/${salesId}`, {
          teamId: otherTeamId,
        })
      ).statusCode,
    ).toBe(400);
  });
  it('allows admin to create, suspend, and activate a user and invalidates sessions', async () => {
    const admin = (await login(`admin-${suffix}@example.test`)).auth;
    const created = await mutation(admin, 'POST', '/api/v1/users', {
      name: 'Created',
      email: `created-${suffix}@example.test`,
      password,
      role: 'sales',
    });
    expect(created.statusCode).toBe(201);
    const id = (created.json() as { user: { id: string } }).user.id;
    const createdAuth = (await login(`created-${suffix}@example.test`)).auth;
    expect((await mutation(admin, 'POST', `/api/v1/users/${id}/suspend`)).statusCode).toBe(200);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/auth/me',
          headers: { cookie: createdAuth.cookie },
        })
      ).statusCode,
    ).toBe(401);
    expect((await mutation(admin, 'POST', `/api/v1/users/${id}/activate`)).statusCode).toBe(200);
  });
  it('does not expose users from another organization', async () => {
    const admin = (await login(`admin-${suffix}@example.test`)).auth;
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/v1/users/${otherUserId}`,
          headers: { cookie: admin.cookie },
        })
      ).statusCode,
    ).toBe(404);
  });
  it('sanitizes passwords, cookies, sessions, CSRF tokens, and CSV payloads from audit data', async () => {
    await writeAudit(prisma, {
      organizationId,
      userId: adminId,
      action: 'test.secret_sanitization',
      entityType: 'test',
      beforeData: {
        safe: 'before',
        password,
        Cookie: 'sales_ai_session=secret-cookie',
      },
      afterData: {
        safe: 'after',
        passwordHash: 'secret-password-hash',
        sessionToken: 'secret-session-token',
        csrfToken: 'secret-csrf-token',
        rawData: { email: 'csv-secret@example.test', phone: '09000000000' },
        rows: [{ name: 'CSV Secret Person' }],
      },
    });
    const logs = await prisma.auditLog.findMany({
      where: { organizationId, action: 'test.secret_sanitization' },
    });
    const serialized = JSON.stringify(logs);
    expect(serialized).not.toContain(password);
    expect(serialized).not.toContain('passwordHash');
    expect(serialized).not.toContain('secret-cookie');
    expect(serialized).not.toContain('secret-session-token');
    expect(serialized).not.toContain('secret-csrf-token');
    expect(serialized).not.toContain('csrfToken');
    expect(serialized).not.toContain('csv-secret@example.test');
    expect(serialized).not.toContain('CSV Secret Person');
    expect(serialized).toContain('before');
    expect(serialized).toContain('after');
  });
  it('rate limits repeated login failures', async () => {
    const email = `missing-${suffix}@example.test`;
    let response;
    for (let index = 0; index < 6; index += 1)
      response = (await login(email, `test-${suffix}`, 'Wrong-Password!')).response;
    expect(response?.statusCode).toBe(429);
  });
});
