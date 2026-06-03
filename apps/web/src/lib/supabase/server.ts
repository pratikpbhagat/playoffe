import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import type { Database } from '@pickleball/db';
import type { User } from '@supabase/supabase-js';

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
