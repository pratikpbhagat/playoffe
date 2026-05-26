'use server';

import { revalidatePath } from 'next/cache';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { createCategorySchema, type CreateCategoryInput } from '@pickleball/shared';

// ── Verify the calling user manages the tournament's club ──────────────────
async function assertTournamentManager(tournamentId: string, userId: string) {
  const admin = createAdminClient();
  const { data: t } = await admin
    .from('tournaments')
    .select('club_id, slug')
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
    slug: '', // set by BEFORE INSERT trigger
    ...parsed.data,
  });

  if (error) return { error: 'Failed to create category. Please try again.' };

  revalidatePath(`/tournaments/${t.slug}`);
  return { success: true };
}

// ── Update a category's details ───────────────────────────────────────────────
export async function updateCategoryAction(
  categoryId: string,
  input: {
    name?: string;
    max_entries?: number | null;
    min_age?: number | null;
    max_age?: number | null;
    play_format?: string;
    draw_format?: string;
  },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const admin = createAdminClient();

  const { data: cat } = await admin
    .from('tournament_categories')
    .select('tournament_id, status, slug, tournaments(slug)')
    .eq('id', categoryId)
    .single();

  if (!cat) return { error: 'Category not found' };

  const t = await assertTournamentManager(cat.tournament_id, user.id);
  if (!t) return { error: 'Permission denied' };

  const update: Record<string, unknown> = {};
  if (input.name !== undefined) update.name = input.name;
  if (input.max_entries !== undefined) update.max_entries = input.max_entries ?? null;
  if (input.min_age !== undefined) update.min_age = input.min_age ?? null;
  if (input.max_age !== undefined) update.max_age = input.max_age ?? null;

  // Only allow format changes before draw is generated
  if (cat.status === 'pending' || cat.status === 'registration') {
    if (input.play_format !== undefined) update.play_format = input.play_format;
    if (input.draw_format !== undefined) update.draw_format = input.draw_format;
  }

  if (Object.keys(update).length === 0) return { error: 'No changes provided' };

  const { error } = await admin
    .from('tournament_categories')
    .update(update)
    .eq('id', categoryId);

  if (error) return { error: 'Failed to update category. Please try again.' };

  const tSlug = (cat.tournaments as { slug: string } | null)?.slug ?? t.slug;
  revalidatePath(`/tournaments/${tSlug}/categories/${cat.slug}`);
  revalidatePath(`/tournaments/${tSlug}`);
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

  revalidatePath(`/tournaments/${t.slug}`);
  return { success: true };
}

// ── Bulk update seeds for all entries in a category ───────────────────────
export async function bulkUpdateSeedsAction(
  categoryId: string,
  seeds: { entryId: string; seed: number | null }[],
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

  // Update all entries in parallel
  const updates = seeds.map(({ entryId, seed }) =>
    admin.from('tournament_entries').update({ seed }).eq('id', entryId),
  );
  await Promise.all(updates);

  revalidatePath(`/tournaments/${t.slug}`);
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

  revalidatePath(`/tournaments/${t.slug}`);
  return { success: true };
}

// ── Finalize category results ──────────────────────────────────────────────────
// Derives winner / runner-up / 3rd place from the completed bracket and marks
// the category as 'completed'. Safe to call multiple times (idempotent).
export async function finalizeCategoryResultsAction(categoryId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const admin = createAdminClient();

  // Fetch category + its tournament for auth + path revalidation
  const { data: cat } = await admin
    .from('tournament_categories')
    .select('id, tournament_id, slug, draw_format, tournaments(club_id, slug)')
    .eq('id', categoryId)
    .single();
  if (!cat) return { error: 'Category not found' };

  const tournament = cat.tournaments as { club_id: string; slug: string } | null;
  if (!tournament) return { error: 'Tournament not found' };

  const t = await assertTournamentManager(cat.tournament_id, user.id);
  if (!t) return { error: 'Permission denied' };

  // Fetch all matches for this category (completed + walkover only)
  const { data: matches } = await admin
    .from('matches')
    .select('id, round, round_name, bracket_type, status, winner_entry_id, entry_a_id, entry_b_id')
    .eq('category_id', categoryId)
    .not('entry_a_id', 'is', null)
    .not('entry_b_id', 'is', null);

  const allMatches = matches ?? [];

  const doneMatches = allMatches.filter(
    (m) => (m.status === 'completed' || m.status === 'walkover') && m.winner_entry_id,
  );

  if (doneMatches.length === 0) return { error: 'No completed matches found' };

  // Check all scheduled/in_progress matches are done
  const pendingCount = allMatches.filter(
    (m) => m.status === 'scheduled' || m.status === 'in_progress',
  ).length;
  if (pendingCount > 0) {
    return { error: `${pendingCount} match${pendingCount !== 1 ? 'es' : ''} still to be played` };
  }

  // Derive positions -----------------------------------------------------------
  let winnerEntryId: string | null = null;
  let runnerUpEntryId: string | null = null;
  let thirdPlaceEntryId: string | null = null;

  const standingsFormats = ['round_robin', 'swiss', 'group_stage_knockout'];

  if (standingsFormats.includes(cat.draw_format)) {
    // Round-robin / Swiss: derive standings from wins
    const wins = new Map<string, number>();
    const pointDiff = new Map<string, number>();
    for (const m of doneMatches) {
      if (!m.winner_entry_id) continue;
      wins.set(m.winner_entry_id, (wins.get(m.winner_entry_id) ?? 0) + 1);
      const loserId = m.winner_entry_id === m.entry_a_id ? m.entry_b_id : m.entry_a_id;
      if (loserId) wins.set(loserId, wins.get(loserId) ?? 0);
    }
    // Collect all unique entry IDs
    const entryIds = new Set<string>();
    for (const m of allMatches) {
      if (m.entry_a_id) entryIds.add(m.entry_a_id);
      if (m.entry_b_id) entryIds.add(m.entry_b_id);
    }
    // Sort by wins desc
    const ranked = [...entryIds].sort(
      (a, b) => (wins.get(b) ?? 0) - (wins.get(a) ?? 0) || (pointDiff.get(b) ?? 0) - (pointDiff.get(a) ?? 0),
    );
    winnerEntryId      = ranked[0] ?? null;
    runnerUpEntryId    = ranked[1] ?? null;
    thirdPlaceEntryId  = ranked[2] ?? null;
  } else {
    // Elimination formats: find the highest-round completed match (the final)
    const maxRound = Math.max(...doneMatches.map((m) => m.round));

    // Look specifically for the 3rd place match first (bracket_type or round_name clue)
    const thirdPlaceMatch = doneMatches.find(
      (m) =>
        m.bracket_type === 'third_place' ||
        (m.round_name ?? '').toLowerCase().includes('3rd') ||
        (m.round_name ?? '').toLowerCase().includes('third'),
    );

    // The final is the highest-round match that is NOT the 3rd place match
    const finalMatch = doneMatches
      .filter((m) => m !== thirdPlaceMatch)
      .sort((a, b) => b.round - a.round)[0];

    if (finalMatch?.winner_entry_id) {
      winnerEntryId = finalMatch.winner_entry_id;
      // Runner-up is the loser of the final
      runnerUpEntryId =
        finalMatch.winner_entry_id === finalMatch.entry_a_id
          ? finalMatch.entry_b_id
          : finalMatch.entry_a_id;
    }

    if (thirdPlaceMatch?.winner_entry_id) {
      thirdPlaceEntryId = thirdPlaceMatch.winner_entry_id;
    } else if (!thirdPlaceMatch) {
      // In SE without a 3rd-place match, the two losing semifinalists share 3rd.
      // Set to null — the organiser can set manually if needed.
      thirdPlaceEntryId = null;
    }
  }

  // Persist results + mark category completed
  const { error: updateErr } = await admin
    .from('tournament_categories')
    .update({
      status: 'completed',
      winner_entry_id:      winnerEntryId,
      runner_up_entry_id:   runnerUpEntryId,
      third_place_entry_id: thirdPlaceEntryId,
    })
    .eq('id', categoryId);

  if (updateErr) return { error: 'Failed to save category results' };

  const tSlug = tournament.slug;
  revalidatePath(`/tournaments/${tSlug}/results`);
  revalidatePath(`/tournaments/${tSlug}/categories/${cat.slug}`);
  revalidatePath(`/tournaments/${tSlug}`);
  return { success: true, winnerEntryId, runnerUpEntryId, thirdPlaceEntryId };
}
