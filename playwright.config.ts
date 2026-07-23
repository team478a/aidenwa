import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:3000' },
  webServer: [
    {
      command: 'pnpm dev:web',
      url: 'http://127.0.0.1:3000/api/health',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'pnpm db:seed:e2e && pnpm dev:api',
      url: 'http://127.0.0.1:3001/health',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'pnpm dev:worker',
      url: 'http://127.0.0.1:3001/health/worker',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
