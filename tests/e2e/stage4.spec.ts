import { expect, test } from '@playwright/test';

test('Stage 4A readiness configures mock-only limits, allowlist and emergency stop', async ({
  page,
}) => {
  const adminLogin = await page.request.post('/backend/auth/login', {
    data: { email: 'admin@example.local', password: 'Stage1-E2E-Admin!' },
  });
  expect(adminLogin.ok(), await adminLogin.text()).toBeTruthy();
  const adminCookies = [
    ...(adminLogin.headers()['set-cookie'] ?? '').matchAll(/(sales_ai_(?:session|csrf))=([^;,]+)/g),
  ].map(([, name, value]) => ({ name, value, url: 'http://127.0.0.1:3000' }));
  await page.context().addCookies(adminCookies);
  await page.goto('/production-readiness');
  await expect(page.getByRole('heading', { name: '実電話 readiness・安全管理' })).toBeVisible();
  await expect(page.getByText('REAL CALLS DISABLED')).toBeVisible();
  await page.getByRole('button', { name: '安全側の初期制限を設定' }).click();
  await expect(page.getByText('安全側の初期制限を保存しました')).toBeVisible();
  await page.getByLabel('電話番号').fill(`050${Date.now().toString().slice(-8)}`);
  await page.getByLabel('所有者・会社').fill('同意済みテスト所有者');
  await page.getByRole('button', { name: '同意確認済みとして登録' }).click();
  await expect(page.getByText(/限定テスト番号を登録しました/)).toBeVisible();
  await page.getByLabel('停止理由').fill('Stage 4A E2E emergency stop');
  await page.getByRole('button', { name: '組織を緊急停止' }).click();
  await expect(page.getByText('組織の緊急停止を有効にしました')).toBeVisible();
  const stops = await page.request.get('/backend/emergency-stops');
  const active = (
    (await stops.json()) as { stops: Array<{ id: string; active: boolean; reason: string }> }
  ).stops.find((s) => s.active && s.reason === 'Stage 4A E2E emergency stop');
  expect(active).toBeTruthy();

  await page
    .getByRole('button', { name: 'ログアウト' })
    .evaluate((button: HTMLButtonElement) => button.click());
  await page.getByLabel('メールアドレス').fill('system-admin@example.local');
  await page.getByLabel('パスワード').fill('Stage4A-E2E-System!');
  await page.getByRole('button', { name: 'ログイン' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  const csrf = decodeURIComponent(
    (await page.context().cookies()).find((c) => c.name === 'sales_ai_csrf')?.value ?? '',
  );
  const released = await page.request.post(`/backend/emergency-stops/${active?.id}/release`, {
    headers: { 'x-csrf-token': csrf },
    data: { reason: 'E2E cleanup and recovery verification' },
  });
  expect(released.ok(), await released.text()).toBeTruthy();
  await page.goto('/production-readiness');
  await expect(page.getByText('REAL CALLS DISABLED')).toBeVisible();
  await page.goto('/production-approvals');
  await expect(page.getByRole('heading', { name: '実電話承認管理' })).toBeVisible();
  await expect(page.getByText('Mock-only technical E2E approval').first()).toBeVisible();
  await page.goto('/production-operations');
  await expect(page.getByRole('heading', { name: '発信上限・料金・拒否監視' })).toBeVisible();
  await expect(page.getByText('PRODUCTION DISABLED')).toBeVisible();
});
