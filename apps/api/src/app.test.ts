import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app';

const apps: ReturnType<typeof buildApp>[] = [];
afterEach(async () => Promise.all(apps.map((app) => app.close())));

describe('API health', () => {
  it('returns a healthy response', async () => {
    const app = buildApp({ NODE_ENV: 'test' });
    apps.push(app);
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ service: 'api', status: 'ok' });
  });
});
