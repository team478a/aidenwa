import { describe, expect, it, vi } from 'vitest';
import { finishMediaSession } from './media-stream.repository.js';

describe('media stream repository state mapping', () => {
  it('maps normal completion without persisting a failure code', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      realtimeCallSession: {
        findUnique: vi.fn().mockResolvedValue({ startedAt: new Date('2026-01-01T00:00:00Z') }),
        updateMany,
      },
    };
    await finishMediaSession(
      prisma as never,
      'session',
      'normal_completion',
      new Date('2026-01-01T00:00:05Z'),
    );
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        // Vitest asymmetric matchers are intentionally untyped at this assertion boundary.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({
          status: 'completed',
          failureCode: null,
          durationSeconds: 5,
        }),
      }),
    );
  });
});
