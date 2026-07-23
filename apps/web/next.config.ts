import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  rewrites() {
    return Promise.resolve([
      { source: '/backend/:path*', destination: 'http://127.0.0.1:3001/api/v1/:path*' },
    ]);
  },
};
export default nextConfig;
