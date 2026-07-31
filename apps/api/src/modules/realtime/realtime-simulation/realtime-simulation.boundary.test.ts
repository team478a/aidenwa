import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

describe('realtime simulation module boundary', () => {
  it('keeps the legacy service path as compatibility exports only', async () => {
    const source = await readFile(
      new URL('../../../stage4b2-services.ts', import.meta.url),
      'utf8',
    );
    expect(source).not.toContain('FakeRealtimeProvider');
    expect(source).not.toContain('prisma.');
    expect(source).toContain('realtime-simulation.service.js');
  });
});
