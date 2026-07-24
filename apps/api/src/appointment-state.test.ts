import { describe, expect, it } from 'vitest';
import { assertAppointmentTransition, nextAppointmentStatus } from './appointment-state.js';

describe('appointment state machine', () => {
  it.each([
    ['held', 'confirm', 'confirmed'],
    ['held', 'cancel', 'cancelled'],
    ['confirmed', 'complete', 'completed'],
    ['confirmed', 'no_show', 'no_show'],
    ['confirmed', 'cancel', 'cancelled'],
    ['confirmed', 'request_reschedule', 'reschedule_requested'],
  ] as const)('allows %s -> %s', (current, action, expected) => {
    expect(nextAppointmentStatus(current, action)).toBe(expected);
  });

  it.each([
    ['held', 'complete'],
    ['held', 'no_show'],
    ['cancelled', 'confirm'],
    ['completed', 'cancel'],
    ['no_show', 'complete'],
    ['expired', 'confirm'],
  ] as const)('rejects %s -> %s', (current, action) => {
    expect(nextAppointmentStatus(current, action)).toBeNull();
  });

  it('rejects completion/no-show before start and late cancellation', () => {
    const base = {
      current: 'confirmed',
      startAt: new Date('2026-07-24T10:00:00Z'),
      cancellationDeadlineMinutes: 60,
    };
    expect(() =>
      assertAppointmentTransition({
        ...base,
        action: 'complete',
        now: new Date('2026-07-24T09:59:59Z'),
      }),
    ).toThrow('APPOINTMENT_START_NOT_REACHED');
    expect(() =>
      assertAppointmentTransition({
        ...base,
        action: 'cancel',
        now: new Date('2026-07-24T09:00:01Z'),
      }),
    ).toThrow('APPOINTMENT_CANCELLATION_DEADLINE_PASSED');
  });
});
