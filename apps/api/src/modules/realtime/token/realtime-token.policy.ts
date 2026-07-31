import type { ApiEnv } from '@sales-ai/validation';
import { verifyRealtimeSessionToken } from '@sales-ai/realtime';
import { TwilioVoiceProvider } from '@sales-ai/voice-provider';

export function validateTwilioMediaSignature(env: ApiEnv, signature: string, url: string) {
  if (!env.TWILIO_AUTH_TOKEN) return false;
  const provider = new TwilioVoiceProvider({
    accountSid: env.TWILIO_ACCOUNT_SID ?? 'AC00000000000000000000000000000000',
    apiKeySid: env.TWILIO_API_KEY_SID ?? 'SK00000000000000000000000000000000',
    apiKeySecret: env.TWILIO_API_KEY_SECRET ?? 'disabled',
    authToken: env.TWILIO_AUTH_TOKEN,
    estimatedCostMinorPerMinute: env.TWILIO_ESTIMATED_COST_MINOR_PER_MINUTE,
    currency: 'JPY',
  });
  return provider.validateWebhook(signature, url, {});
}

export function verifyMediaSessionToken(token: string, secret: string) {
  return verifyRealtimeSessionToken(token, secret);
}
