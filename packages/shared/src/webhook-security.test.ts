import { describe, expect, it } from 'vitest';
import {
  deriveWebhookSecret,
  hashWebhookSecret,
  signWebhook,
  verifyWebhookSignature,
} from './webhook-security.js';

describe('external webhook security', () => {
  it('signs the exact body and enforces the five-minute replay window', () => {
    const secret = deriveWebhookSecret('master-key-at-least-32-bytes-long', 'client-id');
    const timestamp = '1800000000';
    const body = '{"event_id":"evt_1"}';
    const signature = signWebhook(secret, timestamp, body);
    expect(hashWebhookSecret(secret)).not.toContain(secret);
    expect(verifyWebhookSignature(secret, timestamp, body, signature, 1800000299)).toBe(true);
    expect(verifyWebhookSignature(secret, timestamp, `${body} `, signature, 1800000299)).toBe(
      false,
    );
    expect(verifyWebhookSignature(secret, timestamp, body, signature, 1800000301)).toBe(false);
  });
});
