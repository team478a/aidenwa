import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

describe('followup service module boundary', () => {
  it('keeps the legacy Stage 4C service path as compatibility exports only', async () => {
    const source = await readFile(new URL('../../../stage4c-services.ts', import.meta.url), 'utf8');
    expect(source).not.toContain('prisma.');
    expect(source).not.toContain('FakeZoomPhoneProvider');
    expect(source).toContain('followup.service.js');
  });

  it('keeps the Stage 4B2 entry point as registration-only composition', async () => {
    const source = await readFile(new URL('../../../stage4b2-routes.ts', import.meta.url), 'utf8');

    expect(source).not.toContain('prisma.');
    expect(source).not.toContain('app.get(');
    expect(source).not.toContain('app.post(');
    expect(source).toContain('registerFollowupRoutes(app, deps)');
  });
});
