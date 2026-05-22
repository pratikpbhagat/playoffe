'use server';

import { redirect } from 'next/navigation';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { createTournamentSchema, type CreateTournamentInput } from '@pickleball/shared';

export async function createTournamentAction(
  input: CreateTournamentInput & { club_id: string },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { club_id, ...rest } = input;

  if (!club_id) return { error: 'Please select a club.' };

  const parsed = createTournamentSchema.safeParse(rest);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const admin = createAdminClient();

  // Verify caller manages this club
  const { data: mgr } = await admin
    .from('club_managers')
    .select('role')
    .eq('club_id', club_id)
    .eq('player_id', user.id)
    .maybeSingle();

  if (!mgr) {
    return { error: 'You do not have permission to create tournaments for this club.' };
  }

  const { data: tournament, error } = await admin
    .from('tournaments')
    // display_code is set by a BEFORE INSERT trigger; pass empty string as placeholder
    .insert({ ...parsed.data, club_id, created_by: user.id, display_code: '' })
    .select('id')
    .single();

  if (error || !tournament) {
    return { error: 'Failed to create tournament. Please try again.' };
  }

  redirect(`/tournaments/${tournament.id}`);
}

export async function getMyTournaments() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const admin = createAdminClient();

  const { data: managed } = await admin
    .from('club_managers')
    .select('club_id')
    .eq('player_id', user.id);

  const clubIds = (managed ?? []).map((m) => m.club_id);
  if (clubIds.length === 0) return [];

  const { data } = await admin
    .from('tournaments')
    .select('id, name, status, start_date, end_date, display_code, clubs(name)')
    .in('club_id', clubIds)
    .order('start_date', { ascending: false })
    .limit(20);

  return data ?? [];
}

export async function getTournament(id: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from('tournaments')
    .select('*, clubs(id, name, brand_primary_color), tournament_categories(*)')
    .eq('id', id)
    .single();
  return data;
}

export type TournamentStatus =
  | 'draft'
  | 'registration_open'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export async function updateTournamentStatusAction(
  tournamentId: string,
  status: TournamentStatus,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const admin = createAdminClient();

  const { data: tournament } = await admin
    .from('tournaments')
    .select('club_id')
    .eq('id', tournamentId)
    .single();

  if (!tournament) return { error: 'Tournament not found' };

  const { data: mgr } = await admin
    .from('club_managers')
    .select('role')
    .eq('club_id', tournament.club_id)
    .eq('player_id', user.id)
    .maybeSingle();

  if (!mgr) return { error: 'Permission denied' };

  const { error } = await admin
    .from('tournaments')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', tournamentId);

  if (error) return { error: 'Failed to update status' };
  return { success: true };
}
