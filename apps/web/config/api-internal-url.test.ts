import { describe, expect, it } from 'vitest';
import { resolveApiInternalUrl } from './api-internal-url';

describe('resolveApiInternalUrl', () => {
  it('uses localhost only in development when the value is omitted', () => {
    expect(resolveApiInternalUrl({ NODE_ENV: 'development' })).toBe('http://127.0.0.1:3001');
  });

  it('requires an explicit URL outside development', () => {
    expect(() => resolveApiInternalUrl({ NODE_ENV: 'production' })).toThrow(
      'Invalid API_INTERNAL_URL',
    );
    expect(() => resolveApiInternalUrl({ NODE_ENV: 'test' })).toThrow('Invalid API_INTERNAL_URL');
  });

  it('accepts HTTP(S) URLs and removes trailing slashes', () => {
    expect(
      resolveApiInternalUrl({
        NODE_ENV: 'production',
        API_INTERNAL_URL: 'http://api:3001/',
      }),
    ).toBe('http://api:3001');
    expect(
      resolveApiInternalUrl({
        NODE_ENV: 'production',
        API_INTERNAL_URL: 'https://api.internal.example///',
      }),
    ).toBe('https://api.internal.example');
  });

  it.each([
    'api:3001',
    'ftp://api:3001',
    'http://user:password@api:3001',
    'http://api:3001?token=secret',
    'http://api:3001#fragment',
  ])('rejects an unsafe or invalid URL: %s', (API_INTERNAL_URL) => {
    expect(() => resolveApiInternalUrl({ NODE_ENV: 'production', API_INTERNAL_URL })).toThrow(
      'Invalid API_INTERNAL_URL',
    );
  });
});
