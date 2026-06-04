/** @type {import('next').NextConfig} */

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
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
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
        isDev ? 'ws://localhost:*' : '',
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
    ];
  },
};

export default nextConfig;
