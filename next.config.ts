import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Enable server actions and API routes
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  // Ensure API routes work
  api: {
    bodyParser: {
      sizeLimit: '2mb',
    },
  },
};

export default nextConfig;