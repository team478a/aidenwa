import type { ApiEnv } from '@sales-ai/validation';

export function realtimeActivationBlockers(env: ApiEnv) {
  const blockers: string[] = [];
  if (env.VOICE_PROVIDER !== 'twilio') blockers.push('voice_provider_not_twilio');
  if (!env.PRODUCTION_CALLS_ENABLED) blockers.push('production_calls_disabled');
  if (!env.REALTIME_AI_ENABLED) blockers.push('realtime_ai_disabled');
  if (!env.TWILIO_MEDIA_STREAMS_ENABLED) blockers.push('twilio_media_streams_disabled');
  if (!env.OPENAI_API_KEY) blockers.push('openai_key_missing');
  if (!env.TWILIO_AUTH_TOKEN) blockers.push('twilio_auth_token_missing');
  if (!env.REALTIME_SESSION_TOKEN_SECRET) blockers.push('session_token_secret_missing');
  if (!env.TWILIO_MEDIA_STREAM_BASE_URL) blockers.push('media_stream_base_url_missing');
  return blockers;
}
