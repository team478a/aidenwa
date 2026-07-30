import { createHmac } from 'node:crypto';
import type { ApiEnv } from '@sales-ai/validation';
import { TwilioVoiceProvider } from '@sales-ai/voice-provider';

export function productionProviderFromEnv(env: ApiEnv) {
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

export function sourceFingerprint(env: ApiEnv, value: string) {
  return createHmac('sha256', env.SOURCE_NUMBER_FINGERPRINT_KEY).update(value).digest('hex');
}
