import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../database.types';

type Client = SupabaseClient<Database>;

export async function getTournamentByDisplayCode(client: Client, code: string) {
  const { data, error } = await client
    .from('tournaments')
    .select('*, clubs(id, name, logo_url, brand_primary_color, brand_secondary_color)')
    .eq('display_code', code)
    .single();
  if (error) throw error;
  return data;
}

export async function getTournamentWithCategories(client: Client, tournamentId: string) {
  const { data, error } = await client
    .from('tournaments')
    .select('*, tournament_categories(*)')
    .eq('id', tournamentId)
    .single();
  if (error) throw error;
  return data;
}

export async function getLiveMatches(client: Client, tournamentId: string) {
  const { data, error } = await client
    .from('matches')
    .select('*, tournament_entries!entry_a_id(player_id, partner_id), tournament_entries!entry_b_id(player_id, partner_id)')
    .eq('tournament_id', tournamentId)
    .eq('status', 'in_progress')
    .order('scheduled_time');
  if (error) throw error;
  return data;
}

export async function getUpcomingMatches(client: Client, tournamentId: string, limit = 8) {
  const { data, error } = await client
    .from('matches')
    .select('*')
    .eq('tournament_id', tournamentId)
    .eq('status', 'scheduled')
    .order('scheduled_time')
    .limit(limit);
  if (error) throw error;
  return data;
}

export async function getDisplayState(client: Client, tournamentId: string) {
  const { data, error } = await client
    .from('display_state')
    .select('*')
    .eq('tournament_id', tournamentId)
    .single();
  if (error) throw error;
  return data;
}

export async function getClubTournaments(client: Client, clubId: string) {
  const { data, error } = await client
    .from('tournaments')
    .select('*')
    .eq('club_id', clubId)
    .order('start_date', { ascending: false });
  if (error) throw error;
  return data;
}
