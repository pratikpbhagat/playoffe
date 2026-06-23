/** @type {import('next').NextConfig} */
import bundleAnalyzer from '@next/bundle-analyzer';

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

const isDev = process.env.NODE_ENV === 'development';

// ── Security Headers ──────────────────────────────────────────────────────────
const securityHeaders = [
  // Prevent clickjacking
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  // Stop MIME type sniffing
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Referrer policy — don't leak full URL to third parties
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Disable browser features not used by the app
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=()',
  },
  // HSTS — prod only (dev uses http://localhost)
  ...(isDev ? [] : [{
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  }]),
  // Content Security Policy
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // Next.js inline scripts + Supabase auth
      // 'unsafe-eval' is only needed in dev (HMR/eval-source-maps); strip it in prod.
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
      // Tailwind inline styles
      "style-src 'self' 'unsafe-inline'",
      // Images: self + Supabase storage CDN + data URIs
      "img-src 'self' data: blob: https://*.supabase.co https://*.supabase.in",
      // Fonts: self only
      "font-src 'self' data:",
      // API connections: self + Supabase + Anthropic (AI panel)
      [
        "connect-src 'self'",
        'https://*.supabase.co',
        'https://*.supabase.in',
        'wss://*.supabase.co',       // Supabase Realtime
        'https://api.anthropic.com', // AI scheduling assistant
        // Local Supabase (CLI) Realtime websocket — browsers resolve "localhost" and
        // "127.0.0.1" as distinct CSP origins, so both must be listed explicitly.
        isDev ? 'ws://localhost:* ws://127.0.0.1:*' : '',
      ].filter(Boolean).join(' '),
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
];

const nextConfig = {
  transpilePackages: [
    '@pickleball/ui',
    '@pickleball/db',
    '@pickleball/shared',
    '@pickleball/rating',
  ],

  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: 'supabase.co' },
    ],
  },

  experimental: {
    serverActions: {
      allowedOrigins: isDev
        ? ['localhost:3000']
        : ['playoffe.com', 'staging.playoffe.com', '*.vercel.app'],
    },
  },

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
      {
        // Service worker must never be served from cache — browsers use it as
        // the cache root, so a stale sw.js blocks all updates indefinitely.
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
        ],
      },
    ];
  },
};

export default withBundleAnalyzer(nextConfig);
