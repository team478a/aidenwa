import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('handoff module boundaries', () => {
  it('keeps the legacy Stage 4D service path as compatibility exports only', async () => {
    const source = await readFile(new URL('../../stage4d-services.ts', import.meta.url), 'utf8');

    expect(source).not.toContain('prisma.');
    expect(source).not.toContain('$transaction');
    expect(source).toContain('handoff-finalization.service.js');
    expect(source).toContain('handoff-scoring.js');
  });

  it('keeps scoring independent from persistence and external providers', async () => {
    const source = await readFile(new URL('./scoring/handoff-scoring.ts', import.meta.url), 'utf8');

    expect(source).not.toContain('PrismaClient');
    expect(source).not.toContain('fetch(');
    expect(source).not.toContain('Provider');
  });
});
