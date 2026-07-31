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

  it('keeps the Stage 4D entry point as registration-only composition', async () => {
    const source = await readFile(new URL('../../stage4d-routes.ts', import.meta.url), 'utf8');

    expect(source).not.toContain('prisma.');
    expect(source).not.toContain('app.get(');
    expect(source).not.toContain('app.post(');
    expect(source).toContain('registerHandoffRoutes(app, deps)');
  });

  it('keeps handoff feedback append-only', async () => {
    const source = await readFile(
      new URL('./feedback/handoff-feedback.service.ts', import.meta.url),
      'utf8',
    );

    expect(source).toContain('salesHandoffFeedback.create');
    expect(source).not.toContain('salesHandoffFeedback.update');
    expect(source).not.toContain('salesHandoffFeedback.delete');
  });
});
