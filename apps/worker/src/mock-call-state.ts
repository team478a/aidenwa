import type { CallJobStatus, CampaignTargetStatus } from '@sales-ai/database';

export type MockCallStopReason =
  | 'emergency_stop_active'
  | 'campaign_not_running'
  | 'outside_callable_window'
  | 'attempt_limit'
  | 'daily_limit'
  | 'concurrency_limit'
  | 'retry_not_due'
  | 'phone_missing'
  | 'fax'
  | 'not_callable'
  | 'opt_out_before_dispatch'
  | 'provider_temporary_failure';

export type MockCallTransition = {
  callJobStatus: CallJobStatus;
  targetStatus: CampaignTargetStatus;
  excluded: boolean;
};

export function mockCallStopTransition(reason: MockCallStopReason): MockCallTransition {
  if (['phone_missing', 'fax', 'not_callable', 'opt_out_before_dispatch'].includes(reason))
    return { callJobStatus: 'skipped', targetStatus: 'excluded', excluded: true };
  if (reason === 'provider_temporary_failure')
    return { callJobStatus: 'failed', targetStatus: 'retry_wait', excluded: false };
  if (reason === 'retry_not_due')
    return { callJobStatus: 'skipped', targetStatus: 'retry_wait', excluded: false };
  return { callJobStatus: 'skipped', targetStatus: 'pending', excluded: false };
}
