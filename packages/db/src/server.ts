import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { Database } from './database.types';

export function createServerSupabaseClient(
  cookieStore: {
    get(name: string): { value: string } | undefined;
    set(name: string, value: string, options: CookieOptions): void;
    delete(name: string, options: CookieOptions): void;
  },
) {
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return Object.entries(cookieStore).map(([name]) => ({
            name,
            value: cookieStore.get(name)?.value ?? '',
          }));
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        },
      },
    },
  );
}

export function createAdminSupabaseClient() {
  const { createClient } = require('@supabase/supabase-js');
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}
