import { describe, expect, it } from 'vitest';
import type { ApiEnv } from '@sales-ai/validation';
import { realtimeActivationBlockers } from './media-stream.policy.js';

describe('media stream activation policy', () => {
  it('fails closed while realtime and media flags are disabled', () => {
    const blockers = realtimeActivationBlockers({
      VOICE_PROVIDER: 'mock',
      PRODUCTION_CALLS_ENABLED: false,
      REALTIME_AI_ENABLED: false,
      TWILIO_MEDIA_STREAMS_ENABLED: false,
    } as ApiEnv);
    expect(blockers).toContain('voice_provider_not_twilio');
    expect(blockers).toContain('production_calls_disabled');
    expect(blockers).toContain('realtime_ai_disabled');
    expect(blockers).toContain('twilio_media_streams_disabled');
    expect(blockers).toContain('openai_key_missing');
  });
});
