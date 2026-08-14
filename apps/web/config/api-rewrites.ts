export type ApiRewrite = { source: string; destination: string };

export function buildApiRewrites(apiInternalUrl: string): ApiRewrite[] {
  return [
    {
      source: '/backend/external/:path*',
      destination: `${apiInternalUrl}/api/external/:path*`,
    },
    { source: '/backend/:path*', destination: `${apiInternalUrl}/api/v1/:path*` },
  ];
}
