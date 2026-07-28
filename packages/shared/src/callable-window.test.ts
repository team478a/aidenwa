import { describe, expect, it } from 'vitest';
import { inCallableWindow } from './callable-window';

describe('callable window policy', () => {
  it('anchors an overnight continuation to the weekday on which it started', () => {
    const mondayLate = new Date('2026-07-20T14:30:00.000Z');
    const tuesdayEarly = new Date('2026-07-20T16:00:00.000Z');
    expect(inCallableWindow(mondayLate, [1], '22:00', '02:00', 'Asia/Tokyo')).toBe(true);
    expect(inCallableWindow(tuesdayEarly, [1], '22:00', '02:00', 'Asia/Tokyo')).toBe(true);
    expect(inCallableWindow(tuesdayEarly, [2], '22:00', '02:00', 'Asia/Tokyo')).toBe(false);
  });

  it('handles inclusive boundaries and rejects the daytime gap', () => {
    expect(
      inCallableWindow(new Date('2026-07-20T13:00:00.000Z'), [1], '22:00', '02:00', 'Asia/Tokyo'),
    ).toBe(true);
    expect(
      inCallableWindow(new Date('2026-07-20T17:00:00.000Z'), [1], '22:00', '02:00', 'Asia/Tokyo'),
    ).toBe(true);
    expect(
      inCallableWindow(new Date('2026-07-20T03:00:00.000Z'), [1], '22:00', '02:00', 'Asia/Tokyo'),
    ).toBe(false);
  });

  it('rejects invalid time and timezone inputs', () => {
    const now = new Date('2026-07-20T14:30:00.000Z');
    expect(inCallableWindow(now, [1], '24:00', '02:00', 'Asia/Tokyo')).toBe(false);
    expect(inCallableWindow(now, [1], '22:00', '02:00', 'Invalid/Timezone')).toBe(false);
  });
});
