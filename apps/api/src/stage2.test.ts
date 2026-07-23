import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient, UserRole, UserStatus } from '@sales-ai/database';
import { hashPassword } from '@sales-ai/shared/security';
import { buildApp } from './app';
import { findDuplicateCandidates } from './stage2-services';

const db =
  process.env.DATABASE_URL ??
  'postgresql://sales_ai:sales_ai_dev@localhost:5432/sales_ai?schema=public';
const prisma = new PrismaClient({ datasources: { db: { url: db } } });
const suffix = `s2-${Date.now().toString(36)}`;
const password = 'Stage2-Test-Password!';
const app = buildApp({ NODE_ENV: 'test', DEFAULT_ORGANIZATION_SLUG: suffix }, { prisma });
let orgId = '';
let otherOrgId = '';
let salesId = '';
let otherSalesId = '';
type Auth = { cookie: string; csrf: string };
async function login(email: string, slug = suffix) {
  const r = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email, password, organizationSlug: slug },
  });
  const cookies = r.headers['set-cookie'];
  const list = Array.isArray(cookies) ? cookies : [cookies ?? ''];
  const body = r.json<{ csrfToken: string }>();
  return { cookie: list.map((v) => v.split(';')[0]).join('; '), csrf: body.csrfToken };
}
async function req(
  auth: Auth,
  method: 'POST' | 'PATCH' | 'DELETE',
  url: string,
  payload?: Record<string, unknown>,
) {
  return app.inject({
    method,
    url,
    headers: { cookie: auth.cookie, 'x-csrf-token': auth.csrf },
    ...(payload ? { payload } : {}),
  });
}

beforeAll(async () => {
  const hash = await hashPassword(password);
  const org = await prisma.organization.create({ data: { name: 'Stage2 Org', slug: suffix } });
  const other = await prisma.organization.create({
    data: { name: 'Other Stage2', slug: `other-${suffix}` },
  });
  orgId = org.id;
  otherOrgId = other.id;
  const users = await Promise.all([
    prisma.user.create({
      data: {
        organizationId: org.id,
        name: 'Admin',
        email: `admin@${suffix}.test`,
        passwordHash: hash,
        role: UserRole.admin,
        status: UserStatus.active,
      },
    }),
    prisma.user.create({
      data: {
        organizationId: org.id,
        name: 'Manager',
        email: `manager@${suffix}.test`,
        passwordHash: hash,
        role: UserRole.manager,
        status: UserStatus.active,
      },
    }),
    prisma.user.create({
      data: {
        organizationId: org.id,
        name: 'Sales',
        email: `sales@${suffix}.test`,
        passwordHash: hash,
        role: UserRole.sales,
        status: UserStatus.active,
      },
    }),
    prisma.user.create({
      data: {
        organizationId: other.id,
        name: 'Other Sales',
        email: `sales@other-${suffix}.test`,
        passwordHash: hash,
        role: UserRole.sales,
        status: UserStatus.active,
      },
    }),
  ]);
  const [admin, manager, sales, otherSales] = users;
  if (!admin || !manager || !sales || !otherSales) throw new Error('Stage 2 users not created');
  salesId = sales.id;
  otherSalesId = otherSales.id;
});
afterAll(async () => {
  const orgs = [orgId, otherOrgId];
  await prisma.importRow.deleteMany({ where: { importJob: { organizationId: { in: orgs } } } });
  await prisma.importJob.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.optOut.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.salesListCompany.deleteMany({
    where: { salesList: { organizationId: { in: orgs } } },
  });
  await prisma.salesList.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.companyTag.deleteMany({ where: { company: { organizationId: { in: orgs } } } });
  await prisma.tag.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.phoneNumber.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.companyContact.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.company.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.session.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.user.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgs } } });
  await app.close();
  await prisma.$disconnect();
});

describe('Stage 2 sales data', () => {
  it('creates companies, contacts and phones while forcing FAX non-callable', async () => {
    const admin = await login(`admin@${suffix}.test`);
    const c = await req(admin, 'POST', '/api/v1/companies', {
      name: '株式会社 Stage2',
      ownerUserId: salesId,
      corporateNumber: '1234567890123',
      websiteUrl: 'https://www.stage2.example',
    });
    expect(c.statusCode).toBe(201);
    const id = c.json<{ company: { id: string } }>().company.id;
    expect(
      (
        await req(admin, 'POST', `/api/v1/companies/${id}/contacts`, {
          name: '担当 太郎',
          email: ' USER@EXAMPLE.COM ',
        })
      ).statusCode,
    ).toBe(201);
    const fax = await req(admin, 'POST', `/api/v1/companies/${id}/phone-numbers`, {
      rawNumber: '０３－１２３４－５６７８',
      type: 'fax',
      isCallable: true,
      isPrimary: true,
    });
    expect(fax.statusCode).toBe(201);
    expect(fax.json()).toMatchObject({
      phoneNumber: {
        normalizedNumber: '0312345678',
        e164Number: '+81312345678',
        isCallable: false,
      },
    });
  });
  it('enforces organization and sales ownership boundaries', async () => {
    const admin = await login(`admin@${suffix}.test`);
    const sales = await login(`sales@${suffix}.test`);
    const otherCompany = await prisma.company.create({
      data: {
        organizationId: otherOrgId,
        name: 'Other',
        normalizedName: 'other',
        ownerUserId: otherSalesId,
      },
    });
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/v1/companies/${otherCompany.id}`,
          headers: { cookie: admin.cookie },
        })
      ).statusCode,
    ).toBe(404);
    const unowned = await prisma.company.create({
      data: { organizationId: orgId, name: 'Unowned', normalizedName: 'unowned' },
    });
    expect(
      (await req(sales, 'PATCH', `/api/v1/companies/${unowned.id}`, { name: 'Stolen' })).statusCode,
    ).toBe(404);
    expect((await req(sales, 'POST', '/api/v1/imports/companies/upload')).statusCode).toBe(403);
  });
  it('rejects cross-organization contacts and detects duplicates without merging', async () => {
    const admin = await login(`admin@${suffix}.test`);
    const company = await prisma.company.findFirstOrThrow({
      where: { organizationId: orgId, corporateNumber: '1234567890123' },
    });
    const otherContact = await prisma.companyContact.create({
      data: {
        organizationId: otherOrgId,
        companyId: (
          await prisma.company.findFirstOrThrow({ where: { organizationId: otherOrgId } })
        ).id,
        name: 'Other Contact',
      },
    });
    expect(
      (
        await req(admin, 'POST', `/api/v1/companies/${company.id}/phone-numbers`, {
          rawNumber: '090-1111-2222',
          contactId: otherContact.id,
          type: 'mobile',
        })
      ).statusCode,
    ).toBe(400);
    const duplicate = await req(admin, 'POST', '/api/v1/companies', {
      name: 'Different Name',
      corporateNumber: '1234567890123',
    });
    expect(duplicate.statusCode).toBe(409);
    const candidates = await app.inject({
      method: 'GET',
      url: `/api/v1/companies/${company.id}/duplicates`,
      headers: { cookie: admin.cookie },
    });
    expect(candidates.statusCode).toBe(200);
    expect(candidates.json()).toMatchObject({ autoMerged: false });
  });
  it('supports tags and fixed lists with organization checks', async () => {
    const admin = await login(`admin@${suffix}.test`);
    const company = await prisma.company.findFirstOrThrow({ where: { organizationId: orgId } });
    const tag = await req(admin, 'POST', '/api/v1/tags', {
      name: `Priority-${suffix}`,
      color: '#22c55e',
    });
    const tagId = tag.json<{ tag: { id: string } }>().tag.id;
    expect(
      (await req(admin, 'POST', `/api/v1/companies/${company.id}/tags`, { tagId })).statusCode,
    ).toBe(201);
    const list = await req(admin, 'POST', '/api/v1/sales-lists', {
      name: `List-${suffix}`,
      listType: 'static',
      filterConditions: {},
    });
    const listId = list.json<{ salesList: { id: string } }>().salesList.id;
    expect(
      (
        await req(admin, 'POST', `/api/v1/sales-lists/${listId}/companies`, {
          companyIds: [company.id],
        })
      ).statusCode,
    ).toBe(200);
  });
  it('returns organization-scoped duplicate candidates with exact-match reasons without merging', async () => {
    const base = await prisma.company.create({
      data: {
        organizationId: orgId,
        name: '重複基準株式会社',
        normalizedName: '重複基準',
        corporateNumber: '9999999999999',
        websiteUrl: 'https://www.duplicate-reason.example/path',
        phoneNumbers: {
          create: {
            organizationId: orgId,
            rawNumber: '03-5555-6666',
            normalizedNumber: '0355556666',
            e164Number: '+81355556666',
            type: 'representative',
          },
        },
      },
    });
    await prisma.company.create({
      data: {
        organizationId: otherOrgId,
        name: '他組織重複',
        normalizedName: '他組織重複',
        corporateNumber: '8888888888888',
        websiteUrl: 'https://duplicate-reason.example',
      },
    });
    const candidates = await findDuplicateCandidates(prisma, orgId, {
      corporateNumber: '9999999999999',
      phone: '０３－５５５５－６６６６',
      websiteUrl: 'https://duplicate-reason.example/other',
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.companyId).toBe(base.id);
    expect(candidates[0]?.reasons).toContain('corporate_number_exact');
    expect(candidates[0]?.reasons).toContain('phone_exact');
    expect(candidates[0]?.reasons).toContain('domain_exact');
    expect(
      await prisma.company.count({
        where: { organizationId: orgId, corporateNumber: '9999999999999' },
      }),
    ).toBe(1);
  });
  it('blocks company/all, phone/phone and channel/email and preserves phone snapshots', async () => {
    const manager = await login(`manager@${suffix}.test`);
    const company = await prisma.company.findFirstOrThrow({
      where: { organizationId: orgId, corporateNumber: '1234567890123' },
    });
    const phone = await prisma.phoneNumber.findFirstOrThrow({ where: { companyId: company.id } });
    const companyBlock = await req(manager, 'POST', '/api/v1/opt-outs', {
      companyId: company.id,
      scope: 'company',
      channel: 'all',
      reasonCode: 'customer_request',
      evidenceText: 'stop all',
    });
    expect(companyBlock.statusCode).toBe(201);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/v1/opt-outs/check?companyId=${company.id}&channel=form`,
          headers: { cookie: manager.cookie },
        })
      ).json(),
    ).toMatchObject({ blocked: true, matchedScope: 'company' });
    await req(manager, 'POST', '/api/v1/opt-outs', {
      companyId: company.id,
      phoneNumberId: phone.id,
      scope: 'phone',
      channel: 'phone',
      reasonCode: 'invalid_number',
    });
    await req(manager, 'DELETE', `/api/v1/phone-numbers/${phone.id}`);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/v1/opt-outs/check?phone=${encodeURIComponent(phone.rawNumber)}&channel=phone`,
          headers: { cookie: manager.cookie },
        })
      ).json(),
    ).toMatchObject({ blocked: true, matchedScope: 'phone' });
    await req(manager, 'POST', '/api/v1/opt-outs', {
      companyId: company.id,
      email: 'blocked@example.test',
      scope: 'channel',
      channel: 'email',
      reasonCode: 'internal_block',
    });
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/opt-outs/check?email=blocked%40example.test&channel=email',
          headers: { cookie: manager.cookie },
        })
      ).json(),
    ).toMatchObject({ blocked: true });
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/opt-outs/check?email=blocked%40example.test&channel=form',
          headers: { cookie: manager.cookie },
        })
      ).json(),
    ).toMatchObject({ blocked: false });
  });
  it('allows only admin to release opt-outs and requires a reason', async () => {
    const manager = await login(`manager@${suffix}.test`);
    const admin = await login(`admin@${suffix}.test`);
    const item = await prisma.optOut.findFirstOrThrow({
      where: { organizationId: orgId, status: 'active' },
    });
    expect(
      (
        await req(manager, 'POST', `/api/v1/opt-outs/${item.id}/release`, {
          releaseReason: 'manager no',
        })
      ).statusCode,
    ).toBe(403);
    expect((await req(admin, 'POST', `/api/v1/opt-outs/${item.id}/release`, {})).statusCode).toBe(
      400,
    );
    expect(
      (
        await req(admin, 'POST', `/api/v1/opt-outs/${item.id}/release`, {
          releaseReason: 'admin approved',
        })
      ).statusCode,
    ).toBe(200);
    const auditCount = await prisma.auditLog.count({
      where: { organizationId: orgId, action: 'opt_out.released', entityId: item.id },
    });
    expect(auditCount).toBe(1);
  });
  it('blocks a contact only for the registered contact scope and channel', async () => {
    const manager = await login(`manager@${suffix}.test`);
    const company = await prisma.company.findFirstOrThrow({ where: { organizationId: orgId } });
    const contact = await prisma.companyContact.create({
      data: { organizationId: orgId, companyId: company.id, name: '禁止担当者' },
    });
    const other = await prisma.companyContact.create({
      data: { organizationId: orgId, companyId: company.id, name: '別担当者' },
    });
    expect(
      (
        await req(manager, 'POST', '/api/v1/opt-outs', {
          companyId: company.id,
          contactId: contact.id,
          scope: 'contact',
          channel: 'phone',
          reasonCode: 'customer_request',
        })
      ).statusCode,
    ).toBe(201);
    const check = async (contactId: string, channel: string) =>
      app.inject({
        method: 'GET',
        url: `/api/v1/opt-outs/check?contactId=${contactId}&channel=${channel}`,
        headers: { cookie: manager.cookie },
      });
    expect((await check(contact.id, 'phone')).json()).toMatchObject({
      blocked: true,
      matchedScope: 'contact',
    });
    expect((await check(contact.id, 'email')).json()).toMatchObject({ blocked: false });
    expect((await check(other.id, 'phone')).json()).toMatchObject({ blocked: false });
  });
});
