import type { NextConfig } from 'next';
import { resolveApiInternalUrl } from './config/api-internal-url';

const apiInternalUrl = resolveApiInternalUrl(process.env);
const nextConfig: NextConfig = {
  rewrites() {
    return Promise.resolve([
      { source: '/backend/:path*', destination: `${apiInternalUrl}/api/v1/:path*` },
    ]);
  },
};
export default nextConfig;
