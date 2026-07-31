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

  it('dispatches through independent maintenance jobs', async () => {
    const source = await readFile(new URL('./registry.ts', import.meta.url), 'utf8');
    const jobModules = [
      'health.job.js',
      'import-cleanup.job.js',
      'reservation-recovery.job.js',
      'call-event-cleanup.job.js',
      'realtime-cleanup.job.js',
      'followup-reopen.job.js',
      'handoff-cleanup.job.js',
      'appointment-maintenance.job.js',
      'authorization-expiry.job.js',
      'cost-reconciliation.job.js',
      'outbox-publish.job.js',
      'usage-rebuild.job.js',
    ];

    for (const jobModule of jobModules) expect(source).toContain(jobModule);
    expect(source).not.toContain('prisma.callEvent.deleteMany');
    expect(source).not.toContain('reconcileTwilioCosts');
  });

  it('keeps production cost reconciliation fail-closed', async () => {
    const source = await readFile(new URL('./cost-reconciliation.job.ts', import.meta.url), 'utf8');

    expect(source).toContain("env.VOICE_PROVIDER !== 'twilio'");
    expect(source).toContain('!env.PRODUCTION_CALLS_ENABLED');
  });
});
