import { expect, test } from '@playwright/test';

test('Stage 4B-1 remains fail-closed and exposes only the single-call limited-test UI', async ({
  page,
}) => {
  const login = await page.request.post('/backend/auth/login', {
    data: { email: 'system-admin@example.local', password: 'Stage4A-E2E-System!' },
  });
  expect(login.ok(), await login.text()).toBeTruthy();
  const cookies = [
    ...(login.headers()['set-cookie'] ?? '').matchAll(/(sales_ai_(?:session|csrf))=([^;,]+)/g),
  ].map(([, name, value]) => ({ name, value, url: 'http://127.0.0.1:3000' }));
  await page.context().addCookies(cookies);
  await page.goto('/twilio-limited-test');
  await expect(page.getByRole('heading', { name: 'Twilio同意済み番号限定テスト' })).toBeVisible();
  await expect(page.getByText('DEFAULT DISABLED')).toBeVisible();
  await expect(page.getByText(/Twilio: (disabled|not_configured)/)).toBeVisible();
  await expect(page.getByText('Zoom Phone: 未接続・Stage 4B-2以降')).toBeVisible();
  await expect(page.getByRole('heading', { name: '1件ずつ手動発信' })).toBeVisible();
  await expect(page.getByText('本日の実電話予約:')).toBeVisible();
  await expect(page.getByText('現在の通話数:')).toBeVisible();
  await expect(page.getByRole('button', { name: /一括/u })).toHaveCount(0);
  await expect(page.getByText(/Auth Token|API Key|API_KEY_SECRET/u)).toHaveCount(0);

  const csrf = decodeURIComponent(
    cookies.find((cookie) => cookie.name === 'sales_ai_csrf')?.value ?? '',
  );
  const denied = await page.request.post('/backend/real-calls/manual', {
    headers: { 'x-csrf-token': csrf },
    data: {
      authorizationId: crypto.randomUUID(),
      campaignId: crypto.randomUUID(),
      companyId: crypto.randomUUID(),
      phoneNumberId: crypto.randomUUID(),
      allowlistId: crypto.randomUUID(),
    },
  });
  expect(denied.status()).toBe(409);
  expect(await denied.json()).toMatchObject({ error: { code: 'LIMITED_TEST_INACTIVE' } });
});
