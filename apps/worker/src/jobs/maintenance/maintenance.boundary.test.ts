import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('maintenance module boundary', () => {
  it('keeps the legacy maintenance path as compatibility exports only', async () => {
    const source = await readFile(new URL('../../maintenance.ts', import.meta.url), 'utf8');

    expect(source).not.toContain('switch (');
    expect(source).not.toContain('prisma.');
    expect(source).not.toContain('redis.set');
    expect(source).toContain('./jobs/maintenance/registry.js');
  });
});
