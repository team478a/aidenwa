import { describe, expect, it } from 'vitest';
import { buildApiRewrites } from './api-rewrites';

describe('buildApiRewrites', () => {
  it('routes the external API through its separate unversioned boundary first', () => {
    expect(buildApiRewrites('http://api.railway.internal:3001')).toEqual([
      {
        source: '/backend/external/:path*',
        destination: 'http://api.railway.internal:3001/api/external/:path*',
      },
      {
        source: '/backend/:path*',
        destination: 'http://api.railway.internal:3001/api/v1/:path*',
      },
    ]);
  });

  it('keeps internal admin requests on the existing API v1 boundary', () => {
    const rewrites = buildApiRewrites('http://api:3001');
    expect(rewrites[1]).toEqual({
      source: '/backend/:path*',
      destination: 'http://api:3001/api/v1/:path*',
    });
  });
});
