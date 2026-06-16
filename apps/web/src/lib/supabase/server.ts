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
 * Returns the current user by decoding the JWT from the session cookie
 * locally — no HTTPS round-trip to the Supabase Auth server.
 *
 * Safe for: page personalisation, display logic, FK writes in server actions.
 * The JWT is cryptographically signed so the user ID cannot be forged, and
 * RLS policies remain the real enforcement layer regardless.
 *
 * NOT safe for: operations that must detect mid-session revocation (banned
 * user, role change). Use getVerifiedUser() for those instead.
 */
export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user ?? null;
});

/**
 * Returns the current user with a live round-trip to the Supabase Auth server
 * (~80–150 ms). Guarantees the token hasn't been revoked since it was issued.
 *
 * Use only where the cost is justified by the security requirement:
 * superadmin mutations, permission writes, or any action that could affect
 * other users' data if called by a compromised session.
 */
export const getVerifiedUser = cache(async () => {
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
