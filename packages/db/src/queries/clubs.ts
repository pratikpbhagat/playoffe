import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../database.types';

type Client = SupabaseClient<Database>;

export async function getClubById(client: Client, clubId: string) {
  const { data, error } = await client.from('clubs').select('*').eq('id', clubId).single();
  if (error) throw error;
  return data;
}

export async function getClubMembers(client: Client, clubId: string) {
  const { data, error } = await client
    .from('club_affiliations')
    .select('*, players(id, username, full_name, photo_url, gender)')
    .eq('club_id', clubId)
    .order('is_current', { ascending: false });
  if (error) throw error;
  return data;
}

export async function addPlayerToClub(
  client: Client,
  playerId: string,
  clubId: string,
) {
  const { error: deactivateError } = await client
    .from('club_affiliations')
    .update({ is_current: false, left_at: new Date().toISOString() })
    .eq('player_id', playerId)
    .eq('club_id', clubId)
    .eq('is_current', true);

  if (deactivateError) throw deactivateError;

  const { data, error } = await client
    .from('club_affiliations')
    .insert({
      id: crypto.randomUUID(),
      player_id: playerId,
      club_id: clubId,
      is_current: true,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}
