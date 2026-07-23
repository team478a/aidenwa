import { describe, expect, it } from 'vitest';
import { signRealtimeSessionToken, verifyRealtimeSessionToken } from './index.js';

describe('short-lived realtime session token', () => {
  const secret = 'test-only-secret-with-at-least-32-characters';
  const payload = {
    sessionId: 'session',
    organizationId: 'organization',
    executionId: 'execution',
    purpose: 'twilio_media_stream' as const,
    expiresAt: 2000,
    nonce: 'single-use-state-is-claimed-in-db',
  };

  it('verifies scope data without exposing it in a URL query', () => {
    const token = signRealtimeSessionToken(payload, secret);
    expect(verifyRealtimeSessionToken(token, secret, 1000)).toEqual(payload);
  });

  it('rejects expiry and tampering', () => {
    const token = signRealtimeSessionToken(payload, secret);
    expect(() => verifyRealtimeSessionToken(token, secret, 2000)).toThrow('REALTIME_TOKEN_EXPIRED');
    expect(() => verifyRealtimeSessionToken(`${token}x`, secret, 1000)).toThrow(
      'REALTIME_TOKEN_INVALID',
    );
  });
});
