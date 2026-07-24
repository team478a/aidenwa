import { describe, expect, it } from 'vitest';
import { mockCallStopTransition } from './mock-call-state.js';

describe('mock call state machine', () => {
  it.each([
    ['emergency_stop_active', 'skipped', 'pending', false],
    ['campaign_not_running', 'skipped', 'pending', false],
    ['fax', 'skipped', 'excluded', true],
    ['not_callable', 'skipped', 'excluded', true],
    ['opt_out_before_dispatch', 'skipped', 'excluded', true],
    ['retry_not_due', 'skipped', 'retry_wait', false],
    ['provider_temporary_failure', 'failed', 'retry_wait', false],
  ] as const)(
    'maps %s to consistent job and target states',
    (reason, callJobStatus, targetStatus, excluded) => {
      expect(mockCallStopTransition(reason)).toEqual({
        callJobStatus,
        targetStatus,
        excluded,
      });
    },
  );
});
