import { createHmac, timingSafeEqual } from 'node:crypto';

export type RealtimeSessionToken = {
  sessionId: string;
  organizationId: string;
  executionId: string;
  purpose: 'twilio_media_stream';
  expiresAt: number;
  nonce: string;
};

export function signRealtimeSessionToken(payload: RealtimeSessionToken, secret: string) {
  if (secret.length < 32) throw new Error('REALTIME_TOKEN_SECRET_INVALID');
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

export function verifyRealtimeSessionToken(token: string, secret: string, now = Date.now()) {
  if (secret.length < 32) throw new Error('REALTIME_TOKEN_SECRET_INVALID');
  const [encoded, supplied, extra] = token.split('.');
  if (!encoded || !supplied || extra) throw new Error('REALTIME_TOKEN_INVALID');
  const expected = createHmac('sha256', secret).update(encoded).digest('base64url');
  const valid =
    supplied.length === expected.length &&
    timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
  if (!valid) throw new Error('REALTIME_TOKEN_INVALID');
  const value: unknown = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  if (!value || typeof value !== 'object') throw new Error('REALTIME_TOKEN_INVALID');
  const payload = value as Partial<RealtimeSessionToken>;
  if (
    !payload.sessionId ||
    !payload.organizationId ||
    !payload.executionId ||
    payload.purpose !== 'twilio_media_stream' ||
    !payload.nonce ||
    typeof payload.expiresAt !== 'number'
  )
    throw new Error('REALTIME_TOKEN_INVALID');
  if (payload.expiresAt <= now) throw new Error('REALTIME_TOKEN_EXPIRED');
  return payload as RealtimeSessionToken;
}
