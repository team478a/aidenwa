import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { PrismaClient } from '../../packages/database/src/index';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://sales_ai:sales_ai_dev@localhost:5432/sales_ai?schema=public';

function sessionCookies(setCookie: string) {
  return [...setCookie.matchAll(/(sales_ai_(?:session|csrf))=([^;,]+)/g)].map((match) => ({
    name: match[1]!,
    value: match[2]!,
    url: 'http://127.0.0.1:3000',
  }));
}

test('Stage 4C-4E creates a safe follow-up, handoff, and internal appointment', async ({
  page,
}) => {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const suffix = `e2e-4cde-${Date.now().toString(36)}`;
  const login = await page.request.post('/backend/auth/login', {
    data: { email: 'admin@example.local', password: 'Stage1-E2E-Admin!' },
  });
  expect(login.ok(), await login.text()).toBeTruthy();
  const cookies = sessionCookies(login.headers()['set-cookie'] ?? '');
  await page.context().addCookies(cookies);
  const csrf = decodeURIComponent(
    cookies.find((cookie) => cookie.name === 'sales_ai_csrf')?.value ?? '',
  );
  const headers = { 'x-csrf-token': csrf };

  const admin = await prisma.user.findFirstOrThrow({ where: { email: 'admin@example.local' } });
  const organizationId = admin.organizationId;
  const company = await prisma.company.create({
    data: { organizationId, name: suffix, normalizedName: suffix },
  });
  const phone = await prisma.phoneNumber.create({
    data: {
      organizationId,
      companyId: company.id,
      rawNumber: '0312345678',
      normalizedNumber: `03${Date.now().toString().slice(-8)}`,
      type: 'representative',
      isCallable: true,
    },
  });
  const campaign = await prisma.campaign.create({
    data: {
      organizationId,
      name: suffix,
      productVersionId: randomUUID(),
      aiAgentVersionId: randomUUID(),
      scenarioVersionId: randomUUID(),
      salesListId: randomUUID(),
      createdBy: admin.id,
    },
  });
  const session = await prisma.realtimeCallSession.create({
    data: { organizationId, campaignId: campaign.id, provider: 'fake', status: 'completed' },
  });

  try {
    const simulated = await page.request.post('/backend/fake-sales-handoff/simulate', {
      headers,
      data: {
        fixture: 'hot_callback',
        realtimeSessionId: session.id,
        companyId: company.id,
      },
    });
    expect(simulated.ok(), await simulated.text()).toBeTruthy();
    expect(await simulated.json()).toMatchObject({ externalCalls: 0, aiHandoffEnabled: false });

    const followups = await page.request.get('/backend/human-followup-tasks');
    expect(followups.ok(), await followups.text()).toBeTruthy();
    const followupBody = (await followups.json()) as {
      tasks: Array<{ realtimeSessionId: string }>;
    };
    expect(followupBody.tasks.some((task) => task.realtimeSessionId === session.id)).toBeTruthy();

    await page.goto('/sales-handoffs');
    await expect(page.getByRole('heading', { name: 'AI営業引継ぎカード' })).toBeVisible();
    await expect(page.getByText('温度感: hot')).toBeVisible();
    await page.getByRole('button', { name: '内容は正しい' }).first().click();
    await expect(page.getByRole('status')).toContainText('元のAI評価は変更されません');

    const policy = await prisma.appointmentPolicy.create({
      data: {
        organizationId,
        name: suffix,
        timezone: 'Asia/Tokyo',
        meetingTypeCode: 'sales_meeting',
        durationMinutes: 30,
        minimumNoticeMinutes: 0,
        maximumAdvanceDays: 30,
        holdTtlMinutes: 10,
        assignmentMode: 'manual',
        status: 'published',
        version: 1,
        createdBy: admin.id,
      },
    });
    await prisma.availabilityRule.createMany({
      data: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
        organizationId,
        userId: admin.id,
        timezone: 'Asia/Tokyo',
        weekday,
        startLocalTime: '00:00',
        endLocalTime: '23:59',
      })),
    });
    const from = new Date(Date.now() + 86_400_000);
    const slots = await page.request.post('/backend/appointments/slots', {
      headers,
      data: {
        policyVersionId: policy.id,
        assigneeUserId: admin.id,
        from: from.toISOString(),
        to: new Date(from.getTime() + 86_400_000).toISOString(),
        confirmedTimezone: 'Asia/Tokyo',
        preferredTimeBand: 'any',
      },
    });
    expect(slots.ok(), await slots.text()).toBeTruthy();
    const slotsBody = (await slots.json()) as { slots: Array<{ token: string }> };
    const slot = slotsBody.slots[0]!;
    const held = await page.request.post('/backend/appointments/hold', {
      headers,
      data: {
        slotToken: slot.token,
        idempotencyKey: `stage4f-${randomUUID()}`,
        assigneeUserId: admin.id,
        campaignId: campaign.id,
        companyId: company.id,
      },
    });
    expect(held.status(), await held.text()).toBe(201);
    const heldBody = (await held.json()) as {
      appointment: { id: string; version: number };
    };
    const appointment = heldBody.appointment;
    const confirmed = await page.request.post(`/backend/appointments/${appointment.id}/confirm`, {
      headers,
      data: {
        version: appointment.version,
        customerConfirmed: true,
        confirmationCode: 'customer_confirmed',
      },
    });
    expect(confirmed.ok(), await confirmed.text()).toBeTruthy();
    const invalidTransition = await page.request.post(
      `/backend/appointments/${appointment.id}/confirm`,
      {
        headers,
        data: {
          version: appointment.version + 1,
          customerConfirmed: true,
          confirmationCode: 'duplicate_confirmation',
        },
      },
    );
    expect(invalidTransition.status()).toBe(409);

    await page.goto('/appointments');
    await expect(page.getByRole('heading', { name: '今日の商談予定' })).toBeVisible();
    await expect(page.getByText('状態: confirmed')).toBeVisible();
    await expect(
      page.getByText('外部カレンダーへの登録・招待送信・会議URL作成は行いません'),
    ).toBeVisible();
  } finally {
    const appointmentIds = (
      await prisma.appointment.findMany({
        where: { organizationId, companyId: company.id },
        select: { id: true },
      })
    ).map(({ id }) => id);
    const cardIds = (
      await prisma.salesHandoffCard.findMany({
        where: { organizationId, companyId: company.id },
        select: { id: true },
      })
    ).map(({ id }) => id);
    await prisma.appointmentEvent.deleteMany({
      where: { organizationId, appointmentId: { in: appointmentIds } },
    });
    await prisma.appointment.deleteMany({ where: { organizationId, companyId: company.id } });
    await prisma.availabilityRule.deleteMany({ where: { organizationId, userId: admin.id } });
    await prisma.appointmentPolicy.deleteMany({ where: { organizationId, name: suffix } });
    await prisma.salesHandoffFeedback.deleteMany({
      where: { organizationId, cardId: { in: cardIds } },
    });
    await prisma.salesHandoffCard.deleteMany({ where: { organizationId, companyId: company.id } });
    await prisma.humanFollowupTask.deleteMany({ where: { organizationId, companyId: company.id } });
    await prisma.realtimeCallSession.deleteMany({ where: { id: session.id } });
    await prisma.campaign.deleteMany({ where: { id: campaign.id } });
    await prisma.phoneNumber.deleteMany({ where: { id: phone.id } });
    await prisma.company.deleteMany({ where: { id: company.id } });
    await prisma.$disconnect();
  }
});

test('Stage 4C-4E operational screens remain usable on a smartphone viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const login = await page.request.post('/backend/auth/login', {
    data: { email: 'admin@example.local', password: 'Stage1-E2E-Admin!' },
  });
  expect(login.ok(), await login.text()).toBeTruthy();
  const cookies = sessionCookies(login.headers()['set-cookie'] ?? '');
  await page.context().addCookies(cookies);

  for (const [path, heading] of [
    ['/production-operations', '発信上限・料金・拒否監視'],
    ['/sales-handoffs', 'AI営業引継ぎカード'],
    ['/appointments', '今日の商談予定'],
    ['/appointment-settings', '商談予約設定'],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBeTruthy();
  }
});
