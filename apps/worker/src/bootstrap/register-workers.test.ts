import type { Job } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';
import { createJobProcessor, type JobHandler } from './register-workers.js';

describe('worker job registry', () => {
  it('dispatches a known job exactly once', async () => {
    const handler = vi.fn<JobHandler>().mockResolvedValue(undefined);
    const processor = createJobProcessor({ known: handler });
    const job = { name: 'known', data: { secret: 'not-logged' } } as unknown as Job;
    await processor(job);
    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(job);
  });

  it('warns with only a sanitized name for an unknown job', async () => {
    const warn = vi.fn<(message: string) => void>();
    const processor = createJobProcessor({}, warn);
    await processor({
      name: 'unknown job/with?unsafe',
      data: { password: 'must-not-appear' },
    } as unknown as Job);
    expect(warn).toHaveBeenCalledOnce();
    const message = warn.mock.calls[0]?.[0] ?? '';
    expect(message).toContain('"event":"unknown_job"');
    expect(message).toContain('unknown_job_with_unsafe');
    expect(message).not.toContain('password');
    expect(message).not.toContain('must-not-appear');
  });
});
