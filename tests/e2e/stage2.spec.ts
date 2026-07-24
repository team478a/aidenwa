import path from 'node:path';
import { expect, test } from '@playwright/test';

test('Stage 2 admin workflow preserves duplicate, opt-out, and audit controls', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const suffix = Date.now().toString();
  const companyName = `Stage2 E2E ${suffix}`;
  const tagName = `E2Eタグ ${suffix}`;
  const listName = `E2Eリスト ${suffix}`;
  const login = await page.request.post('/backend/auth/login', {
    data: { email: 'admin@example.local', password: 'Stage1-E2E-Admin!' },
  });
  expect(login.ok()).toBeTruthy();
  const cookieHeader = login.headers()['set-cookie'] ?? '';
  const cookies = [...cookieHeader.matchAll(/(sales_ai_(?:session|csrf))=([^;,]+)/g)].map(
    ([, name, value]) => ({ name, value, url: 'http://127.0.0.1:3000' }),
  );
  expect(cookies).toHaveLength(2);
  await page.context().addCookies(cookies);
  const csrf = decodeURIComponent(
    cookies.find((cookie) => cookie.name === 'sales_ai_csrf')?.value ?? '',
  );
  const mutationHeaders = { 'x-csrf-token': csrf };

  await page.goto('/tags');
  await page.getByPlaceholder('タグ名').fill(tagName);
  await page.getByRole('button', { name: '作成' }).click();
  await expect(page.locator('span.tag').filter({ hasText: tagName })).toBeVisible();

  await page.goto('/sales-lists');
  await page.getByPlaceholder('リスト名').fill(listName);
  await page.getByRole('button', { name: '作成' }).click();
  await expect(page.getByRole('cell', { name: listName })).toBeVisible();

  await page.goto('/companies');
  await page.getByPlaceholder('企業名', { exact: true }).fill(companyName);
  await page.getByPlaceholder('法人番号（13桁）').fill(suffix.slice(-13).padStart(13, '7'));
  await page.getByRole('button', { name: '新規登録' }).click();
  await expect(page).toHaveURL(/\/companies\/[0-9a-f-]+$/);
  await expect(page.getByRole('heading', { name: companyName })).toBeVisible();
  const companyId = page.url().split('/').pop() ?? '';

  const contacts = page.getByRole('heading', { name: '担当者' }).locator('..');
  await contacts.getByPlaceholder('担当者名').fill('E2E担当者');
  await contacts.getByPlaceholder('メール').fill('e2e-contact@example.local');
  await contacts.getByRole('button', { name: '追加' }).click();
  await expect(contacts.getByText('E2E担当者')).toBeVisible();

  const phones = page.getByRole('heading', { name: '電話番号' }).locator('..');
  await phones.getByPlaceholder('電話番号').fill('03-1111-2222');
  await phones.locator('select').selectOption('fax');
  await phones.getByRole('button', { name: '追加' }).click();
  await expect(phones.getByText(/03-1111-2222.*fax.*架電不可/)).toBeVisible();
  await phones.getByPlaceholder('電話番号').fill('03-9876-5432');
  await phones.locator('select').selectOption('representative');
  await phones.getByRole('button', { name: '追加' }).click();
  await expect(phones.getByText(/03-9876-5432.*架電可/)).toBeVisible();

  await page.locator('select[name="tagId"]').selectOption({ label: tagName });
  await page.getByRole('button', { name: 'タグ付与' }).click();
  await expect(page.getByRole('paragraph').filter({ hasText: tagName })).toBeVisible();
  await page.locator('select[name="listId"]').selectOption({ label: listName });
  await page.getByRole('button', { name: '固定リストへ追加' }).click();
  await expect(page.getByRole('paragraph').filter({ hasText: listName })).toBeVisible();

  await page.goto('/imports');
  await page
    .locator('input[type="file"]')
    .setInputFiles(path.resolve('tests/fixtures/stage2-companies.csv'));
  await page.getByRole('button', { name: 'アップロード' }).click();
  await expect(page.getByText('mapping_required')).toBeVisible();
  const previewResponsePromise = page.waitForResponse((response) =>
    response.url().includes('/preview'),
  );
  await page.getByRole('button', { name: '標準列をマッピングしてプレビュー' }).click();
  const previewResponse = await previewResponsePromise;
  const preview = (await previewResponse.json()) as {
    importJob: { id: string };
    rows: Array<{ duplicateCandidates: Array<{ reasons: string[] }> }>;
  };
  expect(preview.rows[0]?.duplicateCandidates[0]?.reasons).toContain('phone_exact');
  await expect(page.getByText('重複候補あり')).toBeVisible();
  await page.getByRole('button', { name: '非同期実行' }).click();
  await expect(page.getByText(/completed/)).toBeVisible({ timeout: 30_000 });
  const retry = await page.request.post(
    `/backend/imports/companies/${preview.importJob.id}/execute`,
    {
      headers: mutationHeaders,
    },
  );
  expect(retry.status()).toBe(409);
  const duplicateSearch = await page.request.get('/backend/companies?phone=0398765432');
  const duplicateBody = (await duplicateSearch.json()) as { companies: Array<{ id: string }> };
  expect(duplicateBody.companies.filter((company) => company.id === companyId)).toHaveLength(1);

  await page.goto(`/companies/${companyId}`);
  await page.getByPlaceholder('根拠').fill('E2E customer request');
  await page.getByRole('button', { name: '営業禁止を登録' }).click();
  await expect(page.getByText(/company\/all.*active/)).toBeVisible();
  const blocked = await page.request.get(
    `/backend/opt-outs/check?companyId=${companyId}&channel=phone`,
  );
  expect(await blocked.json()).toMatchObject({ blocked: true, matchedScope: 'company' });

  await page.goto('/opt-outs');
  const row = page.getByRole('row').filter({ hasText: companyName });
  await expect(row).toContainText('active');
  page.once('dialog', (dialog) => dialog.accept('E2E verified release'));
  await row.getByRole('button', { name: '解除' }).click();
  await expect(row).toContainText('released');

  await page.goto('/audit-logs');
  await expect(page.getByText('opt_out.created').first()).toBeVisible();
  await expect(page.getByText('opt_out.released').first()).toBeVisible();
  await expect(page.getByText('import.completed').first()).toBeVisible();
});
