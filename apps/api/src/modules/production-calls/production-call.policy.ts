import type { ApiEnv } from '@sales-ai/validation';

export function activationBlockers(env: ApiEnv, release: string, written: string) {
  const blockers: string[] = [];
  if (env.NODE_ENV !== 'production') blockers.push('NODE_ENV');
  if (env.VOICE_PROVIDER !== 'twilio') blockers.push('VOICE_PROVIDER');
  if (!env.PRODUCTION_CALLS_ENABLED) blockers.push('PRODUCTION_CALLS_ENABLED');
  if (!env.PRODUCTION_PROVIDER_ALLOWLIST.split(',').includes('twilio'))
    blockers.push('PROVIDER_ALLOWLIST');
  if (env.RELEASE_COMMIT !== release || release !== written) blockers.push('RELEASE_COMMIT');
  for (const key of [
    'TWILIO_ACCOUNT_SID',
    'TWILIO_API_KEY_SID',
    'TWILIO_API_KEY_SECRET',
    'TWILIO_AUTH_TOKEN',
    'TWILIO_FROM_NUMBER',
    'TWILIO_STATUS_CALLBACK_BASE_URL',
    'TWILIO_TWIML_BASE_URL',
  ] as const)
    if (!env[key]) blockers.push(key);
  return blockers;
}

export function dtmfResult(value?: string) {
  return value === '1'
    ? 'test_audio_ok'
    : value === '2'
      ? 'test_audio_issue'
      : value === '9'
        ? 'test_stop_requested'
        : value
          ? 'test_invalid_input'
          : 'test_no_input';
}

export function mapTwilioState(value?: string) {
  return (
    (
      {
        initiated: 'initiated',
        ringing: 'ringing',
        'in-progress': 'in_progress',
        completed: 'completed',
        busy: 'busy',
        'no-answer': 'no_answer',
        failed: 'failed',
        canceled: 'canceled',
      } as Record<
        string,
        | 'initiated'
        | 'ringing'
        | 'in_progress'
        | 'completed'
        | 'busy'
        | 'no_answer'
        | 'failed'
        | 'canceled'
      >
    )[value ?? ''] ?? 'provider_unknown'
  );
}

export function crossedBudgetThresholds(before: number, after: number, limit: number) {
  if (limit <= 0) return ['100_percent'] as const;
  return [
    ...(before < limit * 0.8 && after >= limit * 0.8 ? ['80_percent' as const] : []),
    ...(before < limit * 0.9 && after >= limit * 0.9 ? ['90_percent' as const] : []),
    ...(before < limit && after >= limit ? ['100_percent' as const] : []),
  ];
}
