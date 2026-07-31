import { describe, expect, it } from 'vitest';
import type { ApiEnv } from '@sales-ai/validation';
import { validateTwilioMediaSignature } from './realtime-token.policy.js';

describe('realtime token policy', () => {
  it('fails closed without a Twilio auth token', () => {
    expect(validateTwilioMediaSignature({} as ApiEnv, 'signature', 'https://example.test')).toBe(
      false,
    );
  });
});
