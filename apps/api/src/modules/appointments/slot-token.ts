import { createHmac, timingSafeEqual } from 'node:crypto';
import { appointmentSlotPayloadSchema } from '@sales-ai/validation';

export type SlotPayload = ReturnType<typeof appointmentSlotPayloadSchema.parse>;

const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');

export function signSlot(payload: SlotPayload, secret: string) {
  const body = encode(payload);
  const signature = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${signature}`;
}

export function verifySlot(token: string, secret: string, now = new Date()): SlotPayload {
  const [body, signature] = token.split('.');
  if (!body || !signature) throw new Error('SLOT_TOKEN_INVALID');
  const expected = createHmac('sha256', secret).update(body).digest();
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    throw new Error('SLOT_TOKEN_INVALID');
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    throw new Error('SLOT_TOKEN_INVALID');
  }
  const parsed = appointmentSlotPayloadSchema.safeParse(decoded);
  if (!parsed.success) throw new Error('SLOT_TOKEN_INVALID');
  const value = parsed.data;
  if (new Date(value.expires) <= now) throw new Error('SLOT_TOKEN_EXPIRED');
  return value;
}
