'use server';

import { revalidatePath } from 'next/cache';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { createCategorySchema, type CreateCategoryInput } from '@pickleball/shared';

// ── Verify the calling user manages the tournament's club ──────────────────
async function assertTournamentManager(tournamentId: string, userId: string) {
  const admin = createAdminClient();
  const { data: t } = await admin
    .from('tournaments')
    .select('club_id')
    .eq('id', tournamentId)
    .single();
  if (!t) return null;

  const { data: mgr } = await admin
    .from('club_managers')
    .select('role')
    .eq('club_id', t.club_id)
    .eq('player_id', userId)
    .maybeSingle();

  return mgr ? t : null;
}

// ── Create a tournament category ───────────────────────────────────────────
export async function createCategoryAction(
  tournamentId: string,
  input: CreateCategoryInput,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const parsed = createCategorySchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const t = await assertTournamentManager(tournamentId, user.id);
  if (!t) return { error: 'Permission denied' };

  const admin = createAdminClient();
  const { error } = await admin.from('tournament_categories').insert({
    tournament_id: tournamentId,
    ...parsed.data,
  });

  if (error) return { error: 'Failed to create category. Please try again.' };

  revalidatePath(`/tournaments/${tournamentId}`);
  return { success: true };
}

// ── Fetch a category + its active entries (for the entry management page) ──
export async function getCategoryWithEntries(categoryId: string) {
  const admin = createAdminClient();

  const { data: category } = await admin
    .from('tournament_categories')
    .select(
      '*, tournaments!inner(id, name, club_id, display_code, clubs(name, brand_primary_color))',
    )
    .eq('id', categoryId)
    .single();

  if (!category) return null;

  const { data: entries } = await admin
    .from('tournament_entries')
    .select(
      'id, seed, status, registered_at, players!player_id(id, full_name, username, photo_url, global_stats(current_rating))',
    )
    .eq('category_id', categoryId)
    .eq('status', 'active')
    .order('seed', { ascending: true, nullsFirst: false })
    .order('registered_at', { ascending: true });

  return { category, entries: entries ?? [] };
}

// ── Remove a single entry ──────────────────────────────────────────────────
export async function removeEntryAction(entryId: string, tournamentId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const t = await assertTournamentManager(tournamentId, user.id);
  if (!t) return { error: 'Permission denied' };

  const admin = createAdminClient();
  const { error } = await admin.from('tournament_entries').delete().eq('id', entryId);
  if (error) return { error: 'Failed to remove entry' };

  revalidatePath(`/tournaments/${tournamentId}`);
  return { success: true };
}

// ── Update a seed number ───────────────────────────────────────────────────
export async function updateSeedAction(
  entryId: string,
  seed: number | null,
  tournamentId: string,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const t = await assertTournamentManager(tournamentId, user.id);
  if (!t) return { error: 'Permission denied' };

  const admin = createAdminClient();
  const { error } = await admin
    .from('tournament_entries')
    .update({ seed })
    .eq('id', entryId);

  if (error) return { error: 'Failed to update seed' };
  return { success: true };
}

// ── Add an existing PLAYOFFE player by email ───────────────────────────────
export async function addPlayerByEmailAction(
  tournamentId: string,
  categoryId: string,
  email: string,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const t = await assertTournamentManager(tournamentId, user.id);
  if (!t) return { error: 'Permission denied' };

  const admin = createAdminClient();

  const { data: player } = await admin
    .from('players')
    .select('id')
    .eq('email', email.toLowerCase().trim())
    .maybeSingle();

  if (!player) return { error: 'No PLAYOFFE account found with that email' };

  const { data: existing } = await admin
    .from('tournament_entries')
    .select('id')
    .eq('category_id', categoryId)
    .eq('player_id', player.id)
    .maybeSingle();

  if (existing) return { error: 'Player is already entered in this category' };

  const { error } = await admin.from('tournament_entries').insert({
    tournament_id: tournamentId,
    category_id: categoryId,
    player_id: player.id,
    status: 'active',
  });

  if (error) return { error: 'Failed to add player' };

  revalidatePath(`/tournaments/${tournamentId}`);
  return { success: true };
}
