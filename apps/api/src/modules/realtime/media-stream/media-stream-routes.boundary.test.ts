import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

describe('media stream route boundary', () => {
  it('contains registration only', async () => {
    const source = await readFile(new URL('./media-stream.routes.ts', import.meta.url), 'utf8');
    expect(source).not.toContain('prisma.');
    expect(source).not.toContain('WebSocket');
    expect(source).toContain('registerMediaStreamControllers');
  });
});
