import { expect, test } from '@playwright/test';

test('admin can manage a user, inspect audit logs, and log out', async ({ page }) => {
  const email = `e2e-${Date.now()}@example.local`;
  await page.goto('/login');
  await page.getByLabel('メールアドレス').fill('admin@example.local');
  await page.getByLabel('パスワード').fill('Stage1-E2E-Admin!');
  await page.getByRole('button', { name: 'ログイン' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.getByRole('link', { name: 'ユーザー' }).click();
  await expect(page.getByRole('heading', { name: 'ユーザー', exact: true })).toBeVisible();
  await page.getByPlaceholder('氏名').fill('E2Eユーザー');
  await page.getByPlaceholder('メール').fill(email);
  await page.getByPlaceholder('初期パスワード（12文字以上）').fill('Stage1-E2E-Created!');
  await page.getByRole('button', { name: '作成' }).click();
  const row = page.getByRole('row').filter({ hasText: email });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: '停止' }).click();
  await expect(row).toContainText('suspended');

  await page.goto('/audit-logs');
  await expect(page.getByRole('heading', { name: '監査ログ' })).toBeVisible();
  await expect(page.getByText('user.created').first()).toBeVisible();
  await expect(page.getByText('user.suspended').first()).toBeVisible();

  await page
    .getByRole('button', { name: 'ログアウト' })
    .evaluate((button: HTMLButtonElement) => button.click());
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/users');
  await expect(page).toHaveURL(/\/login$/);
});
