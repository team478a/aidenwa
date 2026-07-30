import type { WorkerEnv } from '@sales-ai/validation';
import { TwilioVoiceProvider } from '@sales-ai/voice-provider';

export function productionProviderReady(env: WorkerEnv, release: string, written: string) {
  return (
    env.NODE_ENV === 'production' &&
    env.VOICE_PROVIDER === 'twilio' &&
    env.PRODUCTION_CALLS_ENABLED &&
    env.PRODUCTION_PROVIDER_ALLOWLIST.split(',').includes('twilio') &&
    env.RELEASE_COMMIT === release &&
    release === written &&
    Boolean(
      env.TWILIO_ACCOUNT_SID &&
      env.TWILIO_API_KEY_SID &&
      env.TWILIO_API_KEY_SECRET &&
      env.TWILIO_AUTH_TOKEN &&
      env.TWILIO_FROM_NUMBER &&
      env.TWILIO_STATUS_CALLBACK_BASE_URL &&
      env.TWILIO_TWIML_BASE_URL,
    )
  );
}

export function productionProviderFromEnv(env: WorkerEnv) {
  if (
    !env.TWILIO_ACCOUNT_SID ||
    !env.TWILIO_API_KEY_SID ||
    !env.TWILIO_API_KEY_SECRET ||
    !env.TWILIO_AUTH_TOKEN
  )
    throw new Error('twilio_credentials_unavailable');
  return new TwilioVoiceProvider({
    accountSid: env.TWILIO_ACCOUNT_SID,
    apiKeySid: env.TWILIO_API_KEY_SID,
    apiKeySecret: env.TWILIO_API_KEY_SECRET,
    authToken: env.TWILIO_AUTH_TOKEN,
    region: env.TWILIO_REGION,
    edge: env.TWILIO_EDGE,
    estimatedCostMinorPerMinute: env.TWILIO_ESTIMATED_COST_MINOR_PER_MINUTE,
    currency: 'JPY',
  });
}

export function providerCallFingerprint(value: string) {
  return value.length < 10 ? 'masked' : `${value.slice(0, 4)}…${value.slice(-4)}`;
}
