import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export function deriveWebhookSecret(masterKey: string, integrationClientId: string) {
  return createHmac('sha256', masterKey)
    .update(`aidenwa:webhook:v1:${integrationClientId}`)
    .digest('base64url');
}

export function hashWebhookSecret(secret: string) {
  return createHash('sha256').update(secret).digest('base64url');
}

export function signWebhook(secret: string, timestamp: string, rawBody: string) {
  return createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
}

export function verifyWebhookSignature(
  secret: string,
  timestamp: string,
  rawBody: string,
  signature: string,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  const sentAt = Number(timestamp);
  if (!Number.isInteger(sentAt) || Math.abs(nowSeconds - sentAt) > 300) return false;
  const expected = Buffer.from(signWebhook(secret, timestamp, rawBody), 'utf8');
  const received = Buffer.from(signature, 'utf8');
  return expected.length === received.length && timingSafeEqual(expected, received);
}
