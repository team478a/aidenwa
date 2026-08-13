import { createHash, randomBytes } from 'node:crypto';

export function hashApiKey(value: string): string {
  return createHash('sha256').update(value).digest('base64url');
}

export function issueApiKey(environment: 'sandbox' | 'production') {
  const prefix = environment === 'sandbox' ? 'aid_test_' : 'aid_live_';
  const apiKey = `${prefix}${randomBytes(32).toString('base64url')}`;
  return { apiKey, apiKeyHash: hashApiKey(apiKey), apiKeyPrefix: `${prefix}${apiKey.slice(-4)}` };
}

export function requestFingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('base64url');
}
