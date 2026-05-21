import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../database.types';

type Client = SupabaseClient<Database>;

export async function getPlayerByUsername(client: Client, username: string) {
  const { data, error } = await client
    .from('players')
    .select('*, player_profiles(*), global_stats(*)')
    .eq('username', username)
    .single();
  if (error) throw error;
  return data;
}

export async function getPlayerById(client: Client, id: string) {
  const { data, error } = await client
    .from('players')
    .select('*, player_profiles(*), global_stats(*)')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

export async function isUsernameAvailable(client: Client, username: string): Promise<boolean> {
  const { data, error } = await client.rpc('check_username_available', { p_username: username });
  if (error) throw error;
  return data;
}

export async function getPlayerClubs(client: Client, playerId: string) {
  const { data, error } = await client
    .from('club_affiliations')
    .select('*, clubs(*)')
    .eq('player_id', playerId)
    .order('is_current', { ascending: false });
  if (error) throw error;
  return data;
}

export async function getPlayerMatchHistory(
  client: Client,
  playerId: string,
  limit = 20,
  offset = 0,
) {
  const { data, error } = await client
    .from('match_history')
    .select('*')
    .eq('player_id', playerId)
    .order('played_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return data;
}

export async function createProvisionalPlayer(
  client: Client,
  input: {
    email: string;
    full_name: string;
    gender: 'male' | 'female' | 'other';
    provisional_claim_token: string;
    provisional_expires_at: string;
  },
) {
  const username = generateUsernameFromName(input.full_name);
  const { data, error } = await client
    .from('players')
    .insert({
      id: crypto.randomUUID(),
      email: input.email,
      username,
      full_name: input.full_name,
      gender: input.gender,
      role: 'player',
      is_provisional: true,
      provisional_claim_token: input.provisional_claim_token,
      provisional_expires_at: input.provisional_expires_at,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

function generateUsernameFromName(fullName: string): string {
  const base = fullName
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 25);
  const suffix = Math.floor(Math.random() * 9000) + 1000;
  return `${base}-${suffix}`;
}
