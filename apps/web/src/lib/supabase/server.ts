import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { cache } from 'react';
import type { Database } from '@pickleball/db';
import type { User } from '@supabase/supabase-js';
import { getPlayerByUsername as _getPlayerByUsername } from '@pickleball/db';

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // `setAll` is called during a page render (not a Server Action),
            // so Next.js won't allow cookie mutation here. The session will be
            // refreshed on the next request — safe to ignore.
          }
        },
      },
    },
  );
}

/**
 * Returns the current authenticated user, memoized per request via React's
 * cache(). Many server components on the same page (AppNav + the page itself)
 * each need the user — cache() ensures at most one Auth-server round trip per
 * request regardless of how many callers there are.
 *
 * Uses getUser() (not getSession()) so the JWT is verified server-side and
 * the session is refreshed if the access token has expired. Using getSession()
 * here produces a Supabase security warning and can leave server components
 * with stale/unverified user data.
 */
export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
});

export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/**
 * Returns true if the given Supabase user holds the super_admin JWT claim.
 * This claim is set in app_metadata and can only be written by the service role.
 */
export function isSuperAdmin(user: User | null): boolean {
  if (!user) return false;
  return user.app_metadata?.role === 'super_admin';
}

/**
 * Returns the active roles array from the user's JWT.
 * Falls back to ['player'] if no roles claim is present.
 */
export function getUserRoles(user: User | null): string[] {
  if (!user) return [];
  const roles = user.app_metadata?.roles as string[] | undefined;
  return roles ?? [];
}

/**
 * Looks up a player by username, memoized per request via React's cache().
 * The profile page and its sub-routes (h2h, matches, stats) all need the
 * same player record — this ensures at most one DB query per username per
 * request regardless of how many server components call it.
 */
export const getPlayerByUsername = cache(async (username: string) => {
  const supabase = await createClient();
  return _getPlayerByUsername(supabase, username);
});
