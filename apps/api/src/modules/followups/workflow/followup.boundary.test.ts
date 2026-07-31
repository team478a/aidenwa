import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

describe('followup service module boundary', () => {
  it('keeps the legacy Stage 4C service path as compatibility exports only', async () => {
    const source = await readFile(new URL('../../../stage4c-services.ts', import.meta.url), 'utf8');
    expect(source).not.toContain('prisma.');
    expect(source).not.toContain('FakeZoomPhoneProvider');
    expect(source).toContain('followup.service.js');
  });
});
