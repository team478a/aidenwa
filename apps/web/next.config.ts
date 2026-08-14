import type { NextConfig } from 'next';
import { resolveApiInternalUrl } from './config/api-internal-url';
import { buildApiRewrites } from './config/api-rewrites';

const apiInternalUrl = resolveApiInternalUrl(process.env);
const nextConfig: NextConfig = {
  // ESLint runs as an explicit required CI step with the Next.js plugin. Avoid the legacy
  // Next 15 build-time detector, which does not recognize our repository-root flat config.
  eslint: { ignoreDuringBuilds: true },
  rewrites() {
    return Promise.resolve(buildApiRewrites(apiInternalUrl));
  },
};
export default nextConfig;
