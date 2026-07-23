import { describe, expect, it } from 'vitest';
import { inCallableWindow, truncateUtc } from './stage4';

describe('Stage 4A production gate time controls', () => {
  it('supports overnight callable windows', () => {
    const late = new Date('2026-07-20T14:30:00.000Z'); // 23:30 JST Monday
    expect(inCallableWindow(late, [1], '22:00', '02:00', 'Asia/Tokyo')).toBe(true);
    expect(inCallableWindow(late, [1], '09:00', '18:00', 'Asia/Tokyo')).toBe(false);
  });
  it('creates deterministic UTC counter periods', () => {
    const value = new Date('2026-07-19T12:34:56.000Z');
    expect(truncateUtc(value, 'hour').toISOString()).toBe('2026-07-19T12:00:00.000Z');
    expect(truncateUtc(value, 'month').toISOString()).toBe('2026-07-01T00:00:00.000Z');
  });
});
