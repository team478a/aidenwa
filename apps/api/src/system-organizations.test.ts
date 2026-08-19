import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient, UserRole, UserStatus } from '@sales-ai/database';
import { hashPassword, verifyPassword } from '@sales-ai/shared/security';
import { buildApp } from './app';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://sales_ai:sales_ai_dev@localhost:5432/sales_ai?schema=public';
const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const suffix = Date.now().toString(36);
const password = 'Phase11-System-Admin!';
const temporaryPassword = 'Phase11-Temporary-Admin!';
const systemSlug = `system-${suffix}`;
const clientSlug = `client-${suffix}`;
const createdSlug = `created-${suffix}`;
let systemOrganizationId = '';
let clientOrganizationId = '';
let systemAdminId = '';
let createdOrganizationId = '';
const app = buildApp({ NODE_ENV: 'test', DEFAULT_ORGANIZATION_SLUG: systemSlug }, { prisma });

type Auth = { cookie: string; csrf: string };

async function login(email: string, organizationSlug: string): Promise<Auth> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email, password, organizationSlug },
  });
  expect(response.statusCode).toBe(200);
  const setCookie = response.headers['set-cookie'];
  const values = Array.isArray(setCookie) ? setCookie : [setCookie ?? ''];
  return {
    cookie: values.map((value) => value.split(';')[0]).join('; '),
    csrf: response.json<{ csrfToken: string }>().csrfToken,
  };
}

function headers(auth: Auth) {
  return { cookie: auth.cookie, 'x-csrf-token': auth.csrf };
}

beforeAll(async () => {
  const passwordHash = await hashPassword(password);
  const [systemOrganization, clientOrganization] = await Promise.all([
    prisma.organization.create({ data: { name: 'System Organization', slug: systemSlug } }),
    prisma.organization.create({ data: { name: 'Client Organization', slug: clientSlug } }),
  ]);
  systemOrganizationId = systemOrganization.id;
  clientOrganizationId = clientOrganization.id;
  const [systemAdmin] = await Promise.all([
    prisma.user.create({
      data: {
        organizationId: systemOrganizationId,
        name: 'System Admin',
        email: `system-${suffix}@example.test`,
        passwordHash,
        role: UserRole.system_admin,
        status: UserStatus.active,
      },
    }),
    prisma.user.create({
      data: {
        organizationId: clientOrganizationId,
        name: 'Client Admin',
        email: `client-${suffix}@example.test`,
        passwordHash,
        role: UserRole.admin,
        status: UserStatus.active,
      },
    }),
  ]);
  systemAdminId = systemAdmin.id;
});

afterAll(async () => {
  const organizationIds = [
    systemOrganizationId,
    clientOrganizationId,
    createdOrganizationId,
  ].filter(Boolean);
  await prisma.session.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await prisma.auditLog.deleteMany({
    where: { OR: [{ organizationId: { in: organizationIds } }, { userId: systemAdminId }] },
  });
  await prisma.user.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  await app.close();
  await prisma.$disconnect();
});

describe('Phase 11 system organization management', () => {
  it('allows only system administrators to list and inspect all organizations', async () => {
    const systemAdmin = await login(`system-${suffix}@example.test`, systemSlug);
    const clientAdmin = await login(`client-${suffix}@example.test`, clientSlug);
    const list = await app.inject({
      method: 'GET',
      url: '/api/v1/system/organizations',
      headers: { cookie: systemAdmin.cookie },
    });
    expect(list.statusCode).toBe(200);
    expect(
      list
        .json<{ organizations: { id: string }[] }>()
        .organizations.some((organization) => organization.id === clientOrganizationId),
    ).toBe(true);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/system/organizations',
          headers: { cookie: clientAdmin.cookie },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/v1/system/organizations/${systemOrganizationId}`,
          headers: { cookie: clientAdmin.cookie },
        })
      ).statusCode,
    ).toBe(403);
  });

  it('creates a client and one temporary-password administrator without exposing secrets', async () => {
    const systemAdmin = await login(`system-${suffix}@example.test`, systemSlug);
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/system/organizations',
      headers: headers(systemAdmin),
      payload: {
        name: 'Created Client',
        slug: createdSlug,
        timezone: 'Asia/Tokyo',
        plan: 'standard',
        monthlyCallLimit: 2500,
        concurrentCallLimit: 3,
        administrator: {
          name: 'Initial Administrator',
          email: `initial-${suffix}@example.test`,
          temporaryPassword,
        },
      },
    });
    expect(response.statusCode).toBe(201);
    const body = response.json<{
      organization: { id: string; plan: string };
      administrator: { id: string; role: string; mustChangePassword: boolean };
    }>();
    createdOrganizationId = body.organization.id;
    expect(body.organization.plan).toBe('standard');
    expect(body.administrator.role).toBe('admin');
    expect(body.administrator.mustChangePassword).toBe(true);
    expect(JSON.stringify(body)).not.toContain(temporaryPassword);
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: body.administrator.id } });
    expect(await verifyPassword(temporaryPassword, stored.passwordHash)).toBe(true);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { organizationId: createdOrganizationId, action: 'system.organization_created' },
    });
    expect(JSON.stringify(audit)).not.toContain(temporaryPassword);
    expect(JSON.stringify(audit)).not.toContain('password');

    const initialLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: `initial-${suffix}@example.test`,
        password: temporaryPassword,
        organizationSlug: createdSlug,
      },
    });
    expect(initialLogin.statusCode).toBe(200);
    const initialCookies = initialLogin.headers['set-cookie'];
    const initialCookieValues = Array.isArray(initialCookies)
      ? initialCookies
      : [initialCookies ?? ''];
    const initialAuth = {
      cookie: initialCookieValues.map((value) => value.split(';')[0]).join('; '),
      csrf: initialLogin.json<{ csrfToken: string }>().csrfToken,
    };
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/organization',
          headers: { cookie: initialAuth.cookie },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/auth/change-password',
          headers: headers(initialAuth),
          payload: {
            currentPassword: temporaryPassword,
            newPassword: 'Phase11-Changed-Admin!',
          },
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: body.administrator.id } }))
        .mustChangePassword,
    ).toBe(false);
  });

  it('updates limits, suspends existing sessions, and activates without physical deletion', async () => {
    const systemAdmin = await login(`system-${suffix}@example.test`, systemSlug);
    const clientAdmin = await login(`client-${suffix}@example.test`, clientSlug);
    const limits = await app.inject({
      method: 'PATCH',
      url: `/api/v1/system/organizations/${clientOrganizationId}/limits`,
      headers: headers(systemAdmin),
      payload: { plan: 'enterprise', monthlyCallLimit: 5000, concurrentCallLimit: 5 },
    });
    expect(limits.statusCode).toBe(200);
    const suspend = await app.inject({
      method: 'POST',
      url: `/api/v1/system/organizations/${clientOrganizationId}/suspend`,
      headers: headers(systemAdmin),
    });
    expect(suspend.statusCode).toBe(200);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/auth/me',
          headers: { cookie: clientAdmin.cookie },
        })
      ).statusCode,
    ).toBe(401);
    expect(await prisma.organization.count({ where: { id: clientOrganizationId } })).toBe(1);
    const activate = await app.inject({
      method: 'POST',
      url: `/api/v1/system/organizations/${clientOrganizationId}/activate`,
      headers: headers(systemAdmin),
    });
    expect(activate.statusCode).toBe(200);
    const updated = await prisma.organization.findUniqueOrThrow({
      where: { id: clientOrganizationId },
    });
    expect(updated).toMatchObject({
      status: 'active',
      plan: 'enterprise',
      monthlyCallLimit: 5000,
      concurrentCallLimit: 5,
    });
  });

  it('does not allow a client administrator to change organization status', async () => {
    const clientAdmin = await login(`client-${suffix}@example.test`, clientSlug);
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/v1/organization',
      headers: headers(clientAdmin),
      payload: { status: 'suspended' },
    });
    expect(response.statusCode).toBe(400);
    expect(
      (await prisma.organization.findUniqueOrThrow({ where: { id: clientOrganizationId } })).status,
    ).toBe('active');
  });
});
