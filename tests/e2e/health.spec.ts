import { expect, test } from '@playwright/test';

test('web, API, and worker health checks are available', async ({ page, request }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: '管理画面にログイン' })).toBeVisible();

  const web = await request.get('/api/health');
  expect(web.ok()).toBe(true);
  expect(await web.json()).toMatchObject({ service: 'web', status: 'ok' });

  const api = await request.get('http://127.0.0.1:3001/health');
  expect(api.ok()).toBe(true);
  expect(await api.json()).toMatchObject({ service: 'api', status: 'ok' });

  const worker = await request.get('http://127.0.0.1:3001/health/worker');
  expect(worker.ok()).toBe(true);
  expect(await worker.json()).toMatchObject({ service: 'worker', status: 'ok' });
});
