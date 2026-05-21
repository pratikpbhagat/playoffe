import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@pickleball/db';

export async function generateUsernameFromName(
  client: SupabaseClient<Database>,
  fullName: string,
): Promise<string> {
  const base = fullName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 24);

  let attempts = 0;
  while (attempts < 10) {
    const suffix = Math.floor(Math.random() * 9000) + 1000;
    const candidate = `${base}-${suffix}`;
    const { data } = await client.rpc('check_username_available', { p_username: candidate });
    if (data) return candidate;
    attempts++;
  }

  return `player-${Date.now()}`;
}
