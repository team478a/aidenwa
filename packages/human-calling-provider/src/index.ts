import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export type ProviderHealth = { status: 'disabled' | 'fake' | 'ready' | 'misconfigured' };
export type PhoneUser = { fingerprint: string; active: boolean };
export type NormalizedCallResult =
  'connected' | 'no_answer' | 'busy' | 'not_connected' | 'provider_failed' | 'unknown';
export type PhoneCallLog = {
  callFingerprint: string;
  userFingerprint: string;
  destinationFingerprint: string;
  direction: 'outbound' | 'inbound';
  startedAt: Date;
  endedAt?: Date;
  result: NormalizedCallResult;
};
export interface HumanCallingProvider {
  health(): Promise<ProviderHealth>;
  listUsers(input: { pageToken?: string }): Promise<{ users: PhoneUser[]; nextPageToken?: string }>;
  listCallLogs(input: { from: Date; to: Date }): Promise<{ calls: PhoneCallLog[] }>;
  verifyWebhook(input: {
    timestamp: string;
    signature: string;
    rawBody: Buffer;
  }): Promise<{ valid: boolean; eventFingerprint: string }>;
}
export type HttpTransport = (input: {
  url: string;
  method: 'GET' | 'POST';
  headers: Record<string, string>;
  body?: string;
}) => Promise<{ status: number; headers: Record<string, string>; body: unknown }>;

export class DisabledHumanCallingProvider implements HumanCallingProvider {
  health() {
    return Promise.resolve({ status: 'disabled' as const });
  }
  listUsers(): Promise<{ users: PhoneUser[] }> {
    return Promise.reject(new Error('ZOOM_PHONE_DISABLED'));
  }
  listCallLogs(): Promise<{ calls: PhoneCallLog[] }> {
    return Promise.reject(new Error('ZOOM_PHONE_DISABLED'));
  }
  verifyWebhook(): Promise<{ valid: boolean; eventFingerprint: string }> {
    return Promise.resolve({ valid: false, eventFingerprint: '' });
  }
}

export type FakeZoomFixture =
  'connected' | 'no_answer' | 'busy' | 'rejected' | 'provider_failed' | 'ambiguous' | 'unknown';
export class FakeZoomPhoneProvider implements HumanCallingProvider {
  constructor(
    private readonly fixture: FakeZoomFixture = 'connected',
    private readonly secret = 'fake-zoom-webhook-secret',
  ) {}
  health() {
    return Promise.resolve({ status: 'fake' as const });
  }
  listUsers() {
    return Promise.resolve({ users: [{ fingerprint: fingerprint('fake-user'), active: true }] });
  }
  listCallLogs(input: { from: Date; to: Date }) {
    const count = this.fixture === 'ambiguous' ? 2 : 1;
    return Promise.resolve({
      calls: Array.from({ length: count }, (_, index) => ({
        callFingerprint: fingerprint(`fake-call-${index}`),
        userFingerprint: fingerprint('fake-user'),
        destinationFingerprint: fingerprint('fake-destination'),
        direction: 'outbound' as const,
        startedAt: new Date(input.from.getTime() + index * 1000),
        endedAt: input.to,
        result: normalizeZoomCallResult(this.fixture),
      })),
    });
  }
  verifyWebhook(input: { timestamp: string; signature: string; rawBody: Buffer }) {
    return Promise.resolve(verifyZoomWebhook({ ...input, secret: this.secret }));
  }
}

export class ZoomPhoneProvider implements HumanCallingProvider {
  private token: { value: string; expiresAt: number } | undefined;
  constructor(
    private readonly config: {
      enabled: boolean;
      accountId?: string;
      clientId?: string;
      clientSecret?: string;
      webhookSecret?: string;
      baseUrl: string;
      fingerprintSecret: string;
    },
    private readonly transport: HttpTransport,
    private readonly sleep: (milliseconds: number) => Promise<void> = (milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)),
  ) {}
  health() {
    return Promise.resolve({
      status: !this.config.enabled
        ? ('disabled' as const)
        : this.config.accountId &&
            this.config.clientId &&
            this.config.clientSecret &&
            this.validBaseUrl()
          ? ('ready' as const)
          : ('misconfigured' as const),
    });
  }
  async listUsers() {
    await this.assertReady();
    const body = await this.request('/phone/users?page_size=100');
    const rows =
      body && typeof body === 'object' && Array.isArray((body as Record<string, unknown>).users)
        ? ((body as Record<string, unknown>).users as unknown[])
        : [];
    return {
      users: rows.flatMap((item) => {
        if (!item || typeof item !== 'object') return [];
        const row = item as Record<string, unknown>;
        const id = text(row.id);
        return id
          ? [
              {
                fingerprint: hmac(this.config.fingerprintSecret, id),
                active: text(row.status) !== 'inactive',
              },
            ]
          : [];
      }),
    };
  }
  async listCallLogs(input: { from: Date; to: Date }) {
    await this.assertReady();
    const body = await this.request(
      `/phone/call_history?from=${encodeURIComponent(input.from.toISOString().slice(0, 10))}&to=${encodeURIComponent(input.to.toISOString().slice(0, 10))}`,
    );
    return { calls: normalizeCallHistory(body, this.config.fingerprintSecret) };
  }
  verifyWebhook(input: { timestamp: string; signature: string; rawBody: Buffer }) {
    return Promise.resolve(
      this.config.webhookSecret
        ? verifyZoomWebhook({ ...input, secret: this.config.webhookSecret })
        : { valid: false, eventFingerprint: '' },
    );
  }
  private validBaseUrl() {
    return this.config.baseUrl === 'https://api.zoom.us/v2';
  }
  private async assertReady() {
    if ((await this.health()).status !== 'ready')
      throw new Error('ZOOM_PHONE_DISABLED_OR_MISCONFIGURED');
  }
  private async accessToken() {
    if (this.token && this.token.expiresAt > Date.now() + 30_000) return this.token.value;
    const response = await this.transport({
      url: `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(this.config.accountId ?? '')}`,
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64')}`,
      },
    });
    if (response.status !== 200 || !response.body || typeof response.body !== 'object')
      throw new Error('ZOOM_OAUTH_FAILED');
    const body = response.body as Record<string, unknown>;
    if (typeof body.access_token !== 'string') throw new Error('ZOOM_OAUTH_FAILED');
    this.token = {
      value: body.access_token,
      expiresAt: Date.now() + Math.min(Number(body.expires_in ?? 3600), 3600) * 1000,
    };
    return this.token.value;
  }
  private async request(path: string) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await this.transport({
        url: `${this.config.baseUrl}${path}`,
        method: 'GET',
        headers: { Authorization: `Bearer ${await this.accessToken()}` },
      });
      if (response.status === 200) return response.body;
      if (response.status === 401 || response.status === 403)
        throw new Error('ZOOM_AUTHORIZATION_FAILED');
      if (response.status !== 429 || attempt === 2)
        throw new Error(response.status === 429 ? 'ZOOM_RATE_LIMITED' : 'ZOOM_API_FAILED');
      const retryAfter = Number(response.headers['retry-after'] ?? 1);
      await this.sleep(
        Math.min(Math.max(Number.isFinite(retryAfter) ? retryAfter : 1, 0), 30) * 1000,
      );
    }
    throw new Error('ZOOM_API_FAILED');
  }
}

export function normalizeZoomCallResult(value: string): NormalizedCallResult {
  if (['connected', 'answered', 'accepted', 'picked_up', 'succeeded'].includes(value))
    return 'connected';
  if (['no_answer', 'ring_timeout'].includes(value)) return 'no_answer';
  if (value === 'busy') return 'busy';
  if (['rejected', 'canceled', 'unconnected'].includes(value)) return 'not_connected';
  if (['call_failed', 'service_unavailable'].includes(value)) return 'provider_failed';
  return 'unknown';
}
export function verifyZoomWebhook(
  input: { timestamp: string; signature: string; rawBody: Buffer; secret: string },
  now = Date.now(),
) {
  const timestampMs = Number(input.timestamp) * 1000;
  if (!Number.isFinite(timestampMs) || Math.abs(now - timestampMs) > 5 * 60_000)
    return { valid: false, eventFingerprint: '' };
  const expected = `v0=${createHmac('sha256', input.secret)
    .update(`v0:${input.timestamp}:${input.rawBody.toString('utf8')}`)
    .digest('hex')}`;
  const valid =
    expected.length === input.signature.length &&
    timingSafeEqual(Buffer.from(expected), Buffer.from(input.signature));
  return {
    valid,
    eventFingerprint: valid
      ? fingerprint(`${input.timestamp}:${input.rawBody.toString('utf8')}`)
      : '',
  };
}
function normalizeCallHistory(body: unknown, secret: string): PhoneCallLog[] {
  const rows =
    body && typeof body === 'object' && Array.isArray((body as Record<string, unknown>).call_logs)
      ? (body as { call_logs: unknown[] }).call_logs
      : [];
  return rows.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>;
    const callId = text(row.call_id);
    const destination = text(row.callee_number ?? row.callee_did_number);
    if (!callId || !destination) return [];
    return [
      {
        callFingerprint: hmac(secret, callId),
        userFingerprint: hmac(secret, text(row.caller_id)),
        destinationFingerprint: hmac(secret, destination),
        direction: text(row.direction) === 'outbound' ? 'outbound' : 'inbound',
        startedAt: new Date(text(row.start_time)),
        ...(text(row.end_time) ? { endedAt: new Date(text(row.end_time)) } : {}),
        result: normalizeZoomCallResult(text(row.call_result)),
      },
    ];
  });
}
function fingerprint(value: string) {
  return createHash('sha256').update(value).digest('hex');
}
function hmac(secret: string, value: string) {
  return createHmac('sha256', secret).update(value).digest('hex');
}
function text(value: unknown) {
  return typeof value === 'string' ? value : '';
}
