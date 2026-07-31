import { describe, expect, it } from 'vitest';
import { isFreshWebhook, sanitizeWebhookData } from './mock-webhook.policy.js';

describe('mock webhook policy', () => {
  it('rejects stale timestamps and removes sensitive fields', () => {
    expect(isFreshWebhook('2026-01-01T00:00:00.000Z', Date.parse('2026-01-01T00:06:00.000Z'))).toBe(
      false,
    );
    expect(sanitizeWebhookData({ status: 'ok', phone: 'secret', transcript: 'secret' })).toEqual({
      status: 'ok',
    });
  });
});
