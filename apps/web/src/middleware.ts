import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// ── Simple sliding-window rate limiter (edge-compatible, no Redis dependency)
// LIMITATION: this Map lives in the V8 isolate's heap. In production, Vercel
// spawns multiple concurrent isolates (one per worker process), each with its
// own independent copy of rateLimitStore. A client can send N * limit requests
// per window by hitting N different isolates — the counter is NOT shared across
// workers. This is intentional for the current scale (single-region, low-traffic).
// For a globally-enforced limit, replace with @upstash/ratelimit + Upstash Redis.
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

const RATE_LIMIT_RULES: Array<{ pattern: RegExp; limit: number; windowMs: number }> = [
  // Auth endpoints — strict (prevents credential stuffing / brute force)
  { pattern: /^\/api\/auth\//, limit: 10, windowMs: 60_000 },
  // Social posting API — moderate
  { pattern: /^\/api\/social\//, limit: 30, windowMs: 60_000 },
  // AI wizard — each call is a real Claude API spend, keep this tight even
  // per-IP (per-user limiting is also enforced inside the route handler).
  { pattern: /^\/api\/wizard\//, limit: 20, windowMs: 60_000 },
  // All other API routes
  { pattern: /^\/api\//, limit: 120, windowMs: 60_000 },
];

function checkRateLimit(ip: string, pathname: string): { allowed: boolean; limit: number; remaining: number } {
  const rule = RATE_LIMIT_RULES.find((r) => r.pattern.test(pathname));
  if (!rule) return { allowed: true, limit: 0, remaining: 0 };

  // Bucket key: IP + route prefix (not full path, to group endpoints)
  const bucket = pathname.split('/').slice(0, 3).join('/');
  const key    = `${ip}:${bucket}`;
  const now    = Date.now();
  const entry  = rateLimitStore.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + rule.windowMs });
    return { allowed: true, limit: rule.limit, remaining: rule.limit - 1 };
  }

  entry.count += 1;
  const remaining = Math.max(0, rule.limit - entry.count);
  return { allowed: entry.count <= rule.limit, limit: rule.limit, remaining };
}

// Clean up stale entries every 2 minutes to prevent unbounded memory growth
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetAt) rateLimitStore.delete(key);
  }
}, 120_000);

// ── Route classification ───────────────────────────────────────────────────────

const PUBLIC_PATHS = [
  '/',
  '/login',
  '/register',
  '/p/',
  '/display/',
  '/api/auth/',
  '/claim/',
  '/invite/',
];

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // ── Rate limiting (applied before auth check) ──────────────────────────────
  if (pathname.startsWith('/api/')) {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      ?? request.headers.get('x-real-ip')
      ?? '127.0.0.1';

    const { allowed, limit, remaining } = checkRateLimit(ip, pathname);

    if (!allowed) {
      return new NextResponse('Too Many Requests', {
        status: 429,
        headers: {
          'Retry-After':           '60',
          'X-RateLimit-Limit':     String(limit),
          'X-RateLimit-Remaining': '0',
          'Content-Type':          'text/plain',
        },
      });
    }

    // Pass rate limit headers through on successful requests
    if (limit > 0) {
      const response = NextResponse.next({ request });
      response.headers.set('X-RateLimit-Limit',     String(limit));
      response.headers.set('X-RateLimit-Remaining', String(remaining));
      // If it's a public API route, return early without auth check
      if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
        return response;
      }
    }
  }

  // ── Auth guard ─────────────────────────────────────────────────────────────
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  // Skip Supabase round-trip for public routes — prevents login page from
  // hanging when local auth service is slow.
  if (isPublic) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getUser() validates the token with the Supabase Auth server and, if the
  // access token is expired, silently refreshes it using the refresh token.
  // This ensures server components always run with fresh, valid cookies.
  // getSession() does not reliably trigger refresh in all cases — using it
  // here caused intermittent 404s when access tokens expired mid-session.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
