import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  DisabledHumanCallingProvider,
  FakeZoomPhoneProvider,
  ZoomPhoneProvider,
  normalizeZoomCallResult,
  verifyZoomWebhook,
  type HttpTransport,
} from './index.js';

describe('Stage 4C human calling provider', () => {
  it.each([
    ['answered', 'connected'],
    ['ring_timeout', 'no_answer'],
    ['busy', 'busy'],
    ['rejected', 'not_connected'],
    ['service_unavailable', 'provider_failed'],
    ['future_value', 'unknown'],
  ] as const)('normalizes %s', (source, expected) =>
    expect(normalizeZoomCallResult(source)).toBe(expected),
  );
  it('returns deterministic fake logs including ambiguous fixture', async () => {
    expect(
      (
        await new FakeZoomPhoneProvider('ambiguous').listCallLogs({
          from: new Date(0),
          to: new Date(1000),
        })
      ).calls,
    ).toHaveLength(2);
  });
  it('validates timestamped webhook signatures and rejects replay-window expiry', () => {
    const rawBody = Buffer.from('{"event":"phone.callee_ringing"}');
    const timestamp = '1000';
    const secret = 'secret';
    const signature = `v0=${createHmac('sha256', secret).update(`v0:${timestamp}:${rawBody.toString()}`).digest('hex')}`;
    expect(verifyZoomWebhook({ timestamp, signature, rawBody, secret }, 1_000_000).valid).toBe(
      true,
    );
    expect(verifyZoomWebhook({ timestamp, signature, rawBody, secret }, 2_000_000).valid).toBe(
      false,
    );
  });
  it('never creates external traffic while disabled', async () => {
    const transport = vi.fn<HttpTransport>();
    const provider = new ZoomPhoneProvider(
      { enabled: false, baseUrl: 'https://api.zoom.us/v2', fingerprintSecret: 'x'.repeat(32) },
      transport,
    );
    await expect(provider.listCallLogs({ from: new Date(), to: new Date() })).rejects.toThrow(
      'ZOOM_PHONE_DISABLED_OR_MISCONFIGURED',
    );
    await expect(new DisabledHumanCallingProvider().listUsers()).rejects.toThrow(
      'ZOOM_PHONE_DISABLED',
    );
    expect(transport).not.toHaveBeenCalled();
  });
  it('bounds 429 retries and never returns the access token', async () => {
    const transport = vi
      .fn<HttpTransport>()
      .mockResolvedValueOnce({
        status: 200,
        headers: {},
        body: { access_token: 'secret-access-token', expires_in: 3600 },
      })
      .mockResolvedValue({ status: 429, headers: { 'retry-after': '0' }, body: {} });
    const provider = new ZoomPhoneProvider(
      {
        enabled: true,
        accountId: 'account',
        clientId: 'client',
        clientSecret: 'secret',
        baseUrl: 'https://api.zoom.us/v2',
        fingerprintSecret: 'x'.repeat(32),
      },
      transport,
    );
    await expect(provider.listCallLogs({ from: new Date(), to: new Date() })).rejects.toThrow(
      'ZOOM_RATE_LIMITED',
    );
    expect(transport).toHaveBeenCalledTimes(4);
    expect(JSON.stringify(transport.mock.results)).not.toContain('secret-access-token');
  });
});
