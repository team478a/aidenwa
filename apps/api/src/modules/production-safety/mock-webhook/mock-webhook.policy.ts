import { createHmac, timingSafeEqual } from 'node:crypto';

const forbiddenKeys = new Set([
  'phone',
  'phoneNumber',
  'recordingUrl',
  'transcript',
  'raw',
  'authorization',
  'cookie',
  'secret',
]);

export function validMockSignature(
  secret: string,
  timestamp: string,
  body: unknown,
  signature: string,
) {
  const expected = createHmac('sha256', secret)
    .update(`${timestamp}.${JSON.stringify(body)}`)
    .digest('hex');
  return (
    signature.length === expected.length &&
    timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  );
}

export function isFreshWebhook(timestamp: string, now = Date.now()) {
  return Math.abs(now - Date.parse(timestamp)) <= 300_000;
}

export function sanitizeWebhookData(data: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(data).filter(([key]) => !forbiddenKeys.has(key)));
}
