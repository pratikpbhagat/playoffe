import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@pickleball/ui', '@pickleball/db', '@pickleball/shared'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: 'supabase.co' },
    ],
  },
  experimental: {
    serverActions: { allowedOrigins: ['localhost:3000'] },
  },
};

export default nextConfig;
