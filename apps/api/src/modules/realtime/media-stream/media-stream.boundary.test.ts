import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

describe('media stream module boundary', () => {
  it('keeps the legacy media path as compatibility exports only', async () => {
    const source = await readFile(new URL('../../../stage4b2-media.ts', import.meta.url), 'utf8');
    expect(source).not.toContain('WebSocket');
    expect(source).not.toContain('prisma.');
    expect(source).toContain('media-stream.routes.js');
  });
});
