'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient, createClient, getCurrentUser } from '@/lib/supabase/server';
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
  input: CreateCategoryInput & {
    scoring_override?: boolean;
    scoring_format?: 'rally' | 'traditional';
    num_sets?: 1 | 3 | 5;
    points_per_set?: number;
    win_by?: 1 | 2;
    deuce_cap?: number | null;
    groups_count?: number | null;
    group_sizes?: number[] | null;
    advance_per_group?: number;
    has_third_place_match?: boolean;
    knockout_seeding?: 'auto' | 'manual';
  },
) {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return { error: 'Not authenticated' };

  // Destructure scoring override fields before schema validation
  const {
    scoring_override, scoring_format, num_sets, points_per_set, win_by, deuce_cap,
    groups_count, group_sizes, advance_per_group, has_third_place_match, knockout_seeding,
    ...rest
  } = input;

  const parsed = createCategorySchema.safeParse(rest);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const t = await assertTournamentManager(tournamentId, user.id);
  if (!t) return { error: 'Permission denied' };

  const admin = createAdminClient();
  const { error } = await (admin as any).from('tournament_categories').insert({
    tournament_id: tournamentId,
    slug: '', // set by BEFORE INSERT trigger
    ...parsed.data,
    scoring_override: scoring_override ?? false,
    ...(scoring_override && {
      scoring_format: scoring_format ?? null,
      num_sets: num_sets ?? null,
      points_per_set: points_per_set ?? null,
      win_by: win_by ?? null,
      deuce_cap: deuce_cap ?? null,
    }),
    groups_count: groups_count ?? null,
    group_sizes: group_sizes ?? null,
    advance_per_group: advance_per_group ?? 2,
    has_third_place_match: has_third_place_match ?? false,
    knockout_seeding: knockout_seeding ?? 'auto',
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
    scoring_override?: boolean;
    scoring_format?: 'rally' | 'traditional';
    num_sets?: 1 | 3 | 5;
    points_per_set?: number;
    win_by?: 1 | 2;
    deuce_cap?: number | null;
    groups_count?: number | null;
    advance_per_group?: number;
    has_third_place_match?: boolean;
    knockout_seeding?: 'auto' | 'manual';
  },
) {
  const supabase = await createClient();
  const user = await getCurrentUser();
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

  // Scoring override — always editable
  if (input.scoring_override !== undefined) {
    update.scoring_override = input.scoring_override;
    if (!input.scoring_override) {
      // Clear all override values when disabling
      update.scoring_format = null;
      update.num_sets = null;
      update.points_per_set = null;
      update.win_by = null;
      update.deuce_cap = null;
    }
  }
  if (input.scoring_format !== undefined) update.scoring_format = input.scoring_format;
  if (input.num_sets !== undefined) update.num_sets = input.num_sets;
  if (input.points_per_set !== undefined) update.points_per_set = input.points_per_set;
  if (input.win_by !== undefined) update.win_by = input.win_by;
  if ('deuce_cap' in input) update.deuce_cap = input.deuce_cap ?? null;

  // Group stage configuration — always editable (doesn't affect existing entries)
  if ('groups_count' in input) update.groups_count = input.groups_count ?? null;
  if ('group_sizes' in input) update.group_sizes = (input as { group_sizes?: number[] | null }).group_sizes ?? null;
  if (input.advance_per_group !== undefined) update.advance_per_group = input.advance_per_group;
  if (input.has_third_place_match !== undefined) update.has_third_place_match = input.has_third_place_match;
  if (input.knockout_seeding !== undefined) update.knockout_seeding = input.knockout_seeding;

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

// ── Stage scoring CRUD ────────────────────────────────────────────────────────

export type StageKey = 'group_stage' | 'knockout' | 'semifinal' | 'final';

export interface StageScoringRow {
  id: string;
  category_id: string;
  stage: StageKey;
  num_sets: 1 | 3 | 5 | null;
  points_per_set: number | null;
  win_by: 1 | 2 | null;
  deuce_cap: number | null;
}

/** Fetch all stage scoring rows for a category (returns empty array if none). */
export async function getStageScoringAction(categoryId: string): Promise<StageScoringRow[]> {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (admin as any)
    .from('category_stage_scoring')
    .select('*')
    .eq('category_id', categoryId)
    .order('stage');
  return ((data ?? []) as unknown) as StageScoringRow[];
}

/** Upsert a stage scoring override. Pass null values to clear individual fields. */
export async function upsertStageScoringAction(
  categoryId: string,
  stage: StageKey,
  config: {
    num_sets?: 1 | 3 | 5 | null;
    points_per_set?: number | null;
    win_by?: 1 | 2 | null;
    deuce_cap?: number | null;
  },
) {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return { error: 'Not authenticated' };

  const admin = createAdminClient();

  // Verify permission via tournament manager check
  const { data: cat } = await admin
    .from('tournament_categories')
    .select('tournament_id')
    .eq('id', categoryId)
    .single();
  if (!cat) return { error: 'Category not found' };

  const t = await assertTournamentManager(cat.tournament_id, user.id);
  if (!t) return { error: 'Permission denied' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: saved, error } = await (admin as any)
    .from('category_stage_scoring')
    .upsert(
      { category_id: categoryId, stage, ...config },
      { onConflict: 'category_id,stage' },
    )
    .select('*')
    .single();

  if (error) return { error: 'Failed to save stage scoring.' };

  revalidatePath(`/tournaments/${t.slug}`);
  revalidatePath(`/tournaments/${t.slug}/categories/${categoryId}`);
  return { success: true, row: saved as StageScoringRow };
}

/** Delete a stage scoring override (reverts to category/tournament default). */
export async function deleteStageScoringAction(categoryId: string, stage: StageKey) {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return { error: 'Not authenticated' };

  const admin = createAdminClient();

  const { data: cat } = await admin
    .from('tournament_categories')
    .select('tournament_id')
    .eq('id', categoryId)
    .single();
  if (!cat) return { error: 'Category not found' };

  const t = await assertTournamentManager(cat.tournament_id, user.id);
  if (!t) return { error: 'Permission denied' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin as any)
    .from('category_stage_scoring')
    .delete()
    .eq('category_id', categoryId)
    .eq('stage', stage);

  revalidatePath(`/tournaments/${t.slug}`);
  revalidatePath(`/tournaments/${t.slug}/categories/${categoryId}`);
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
      'id, seed, status, registered_at, players!player_id(id, full_name, username, photo_url, global_stats(current_rating)), partner:players!partner_id(id, full_name, username)',
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
  const user = await getCurrentUser();
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
  const user = await getCurrentUser();
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
  const user = await getCurrentUser();
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

// ── Search players (typeahead for add-player input) ───────────────────────
export async function searchPlayersForCategoryAction(query: string) {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user || query.trim().length < 2) return [];

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (admin as any).rpc('search_players_for_assignment', {
    p_query: query.trim(),
    p_limit: 8,
  });
  return (data ?? []) as Array<{ id: string; full_name: string; username: string; email: string }>;
}

// ── Add an existing PLAYOFFE player by email ───────────────────────────────
export async function addPlayerByEmailAction(
  tournamentId: string,
  categoryId: string,
  email: string,
  partnerEmail?: string,   // required for doubles / mixed doubles categories
) {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return { error: 'Not authenticated' };

  const t = await assertTournamentManager(tournamentId, user.id);
  if (!t) return { error: 'Permission denied' };

  const admin = createAdminClient();

  // ── Look up main player ──────────────────────────────────────────────────
  const { data: player } = await admin
    .from('players')
    .select('id')
    .eq('email', email.toLowerCase().trim())
    .maybeSingle();

  if (!player) return { error: 'No PLAYOFFE account found with that email address' };

  // ── Look up partner (doubles) ────────────────────────────────────────────
  let partnerId: string | null = null;
  if (partnerEmail) {
    const normPartner = partnerEmail.toLowerCase().trim();
    if (normPartner === email.toLowerCase().trim()) {
      return { error: 'Player 1 and Player 2 must be different accounts' };
    }
    const { data: partner } = await admin
      .from('players')
      .select('id')
      .eq('email', normPartner)
      .maybeSingle();

    if (!partner) return { error: 'No PLAYOFFE account found for the partner email address' };

    // Check partner not already in the category as an ACTIVE entry
    const { data: partnerEntry } = await admin
      .from('tournament_entries')
      .select('id')
      .eq('category_id', categoryId)
      .neq('status', 'withdrawn')
      .or(`player_id.eq.${partner.id},partner_id.eq.${partner.id}`)
      .maybeSingle();

    if (partnerEntry) return { error: 'Partner is already entered in this category' };

    partnerId = partner.id;
  }

  // ── Check main player not already in category (exclude withdrawn) ────────
  const { data: existing } = await admin
    .from('tournament_entries')
    .select('id')
    .eq('category_id', categoryId)
    .neq('status', 'withdrawn')
    .or(`player_id.eq.${player.id},partner_id.eq.${player.id}`)
    .maybeSingle();

  if (existing) return { error: 'Player is already entered in this category' };

  // ── If a draw has been generated, replace a withdrawn entry ───────────────
  // Instead of inserting a fresh row (which has no bracket slot), reuse the
  // oldest withdrawn entry and reset its matches so the replacement player
  // takes over that bracket position automatically.
  const { data: catRow } = await admin
    .from('tournament_categories')
    .select('status')
    .eq('id', categoryId)
    .single();

  const isDrawn = ['draw_generated', 'in_progress', 'completed'].includes(catRow?.status ?? '');

  if (isDrawn) {
    const { data: withdrawnEntry } = await admin
      .from('tournament_entries')
      .select('id')
      .eq('category_id', categoryId)
      .eq('status', 'withdrawn')
      .order('registered_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (withdrawnEntry) {
      // Update the withdrawn entry to point to the new player(s)
      await admin.from('tournament_entries').update({
        player_id: player.id,
        partner_id: partnerId ?? null,
        status: 'active',
      }).eq('id', withdrawnEntry.id);

      // Reset walkover matches for this entry back to scheduled so the
      // replacement player can play them. (Matches that were already
      // completed before the withdrawal remain untouched.)
      await admin.from('matches').update({
        status: 'scheduled',
        winner_entry_id: null,
        sets: [],
      }).eq('category_id', categoryId)
        .eq('status', 'walkover')
        .or(`entry_a_id.eq.${withdrawnEntry.id},entry_b_id.eq.${withdrawnEntry.id}`);

      revalidatePath(`/tournaments/${t.slug}`);
      return { success: true, replaced: true };
    }
  }

  // ── Normal insert (no draw yet, or no withdrawn slot available) ──────────
  const { error } = await admin.from('tournament_entries').insert({
    tournament_id: tournamentId,
    category_id: categoryId,
    player_id: player.id,
    ...(partnerId ? { partner_id: partnerId } : {}),
    status: 'active',
  });

  if (error) return { error: 'Failed to add player' };

  revalidatePath(`/tournaments/${t.slug}`);
  return { success: true };
}

// ── Finalize category results ──────────────────────────────────────────────────
// Derives winner / runner-up / 3rd place from the completed bracket. Shared by
// the preview and finalize actions below so both see identical results.
async function deriveCategoryResults(categoryId: string, userId: string) {
  const admin = createAdminClient();

  // Fetch category + its tournament for auth + path revalidation
  const { data: cat } = await admin
    .from('tournament_categories')
    .select('id, tournament_id, slug, draw_format, tournaments(club_id, slug)')
    .eq('id', categoryId)
    .single();
  if (!cat) return { error: 'Category not found' } as const;

  const tournament = cat.tournaments as { club_id: string; slug: string } | null;
  if (!tournament) return { error: 'Tournament not found' } as const;

  const t = await assertTournamentManager(cat.tournament_id, userId);
  if (!t) return { error: 'Permission denied' } as const;

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

  if (doneMatches.length === 0) return { error: 'No completed matches found' } as const;

  // Check all scheduled/in_progress matches are done
  const pendingCount = allMatches.filter(
    (m) => m.status === 'scheduled' || m.status === 'in_progress',
  ).length;
  if (pendingCount > 0) {
    return { error: `${pendingCount} match${pendingCount !== 1 ? 'es' : ''} still to be played` } as const;
  }

  // Derive positions -----------------------------------------------------------
  let winnerEntryId: string | null = null;
  let runnerUpEntryId: string | null = null;
  let thirdPlaceEntryId: string | null = null;

  // group_stage_knockout categories with a completed "Final" match should be
  // resolved like an elimination bracket (Final + 3rd place playoff), not by
  // overall win counts — otherwise the 3rd-place playoff loser can outrank
  // the Final's runner-up.
  const finalMatch = doneMatches.find((m) => (m.round_name ?? '').toLowerCase() === 'final');
  const useStandingsRanking =
    cat.draw_format === 'round_robin' ||
    cat.draw_format === 'swiss' ||
    (cat.draw_format === 'group_stage_knockout' && !finalMatch);

  if (useStandingsRanking) {
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
    // Look specifically for the 3rd place match first (bracket_type or round_name clue)
    const thirdPlaceMatch = doneMatches.find(
      (m) =>
        m.bracket_type === 'third_place' ||
        (m.round_name ?? '').toLowerCase().includes('3rd') ||
        (m.round_name ?? '').toLowerCase().includes('third'),
    );

    // The final is the explicitly-named "Final" match if one exists, otherwise
    // fall back to the highest-round match that isn't the 3rd place match.
    const resolvedFinal = finalMatch ?? doneMatches
      .filter((m) => m !== thirdPlaceMatch)
      .sort((a, b) => b.round - a.round)[0];

    if (resolvedFinal?.winner_entry_id) {
      winnerEntryId = resolvedFinal.winner_entry_id;
      // Runner-up is the loser of the final
      runnerUpEntryId =
        resolvedFinal.winner_entry_id === resolvedFinal.entry_a_id
          ? resolvedFinal.entry_b_id
          : resolvedFinal.entry_a_id;
    }

    if (thirdPlaceMatch?.winner_entry_id) {
      thirdPlaceEntryId = thirdPlaceMatch.winner_entry_id;
    } else if (!thirdPlaceMatch) {
      // In SE without a 3rd-place match, the two losing semifinalists share 3rd.
      // Set to null — the organiser can set manually if needed.
      thirdPlaceEntryId = null;
    }
  }

  return { cat, tournament, winnerEntryId, runnerUpEntryId, thirdPlaceEntryId } as const;
}

// Resolve a set of entry IDs to display names ("Player / Partner").
async function resolveEntryNames(entryIds: string[]) {
  const admin = createAdminClient();
  const names = new Map<string, string>();
  if (entryIds.length === 0) return names;

  const { data: entries } = await admin
    .from('tournament_entries')
    .select('id, player_id, partner_id, players!player_id(full_name)')
    .in('id', entryIds);

  const partnerIds = (entries ?? []).map((e) => e.partner_id).filter((x): x is string => x != null);
  const partnerMap = new Map<string, string>();
  if (partnerIds.length > 0) {
    const { data: partners } = await admin
      .from('players')
      .select('id, full_name')
      .in('id', partnerIds);
    for (const p of partners ?? []) partnerMap.set(p.id, p.full_name);
  }

  for (const e of entries ?? []) {
    const pn = (e.players as { full_name: string } | null)?.full_name ?? 'Unknown';
    const partner = e.partner_id ? partnerMap.get(e.partner_id) : null;
    names.set(e.id, partner ? `${pn} / ${partner}` : pn);
  }
  return names;
}

// ── Preview category results ─────────────────────────────────────────────────
// Computes the would-be winner / runner-up / 3rd place without persisting
// anything, so the UI can show a confirmation preview before finalizing.
export async function previewCategoryResultsAction(categoryId: string) {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return { error: 'Not authenticated' };

  const result = await deriveCategoryResults(categoryId, user.id);
  if ('error' in result) return { error: result.error };

  const { winnerEntryId, runnerUpEntryId, thirdPlaceEntryId } = result;
  const names = await resolveEntryNames(
    [winnerEntryId, runnerUpEntryId, thirdPlaceEntryId].filter((x): x is string => x != null),
  );

  return {
    success: true,
    winner:     winnerEntryId    ? { id: winnerEntryId,    name: names.get(winnerEntryId)    ?? 'Unknown' } : null,
    runnerUp:   runnerUpEntryId  ? { id: runnerUpEntryId,  name: names.get(runnerUpEntryId)  ?? 'Unknown' } : null,
    thirdPlace: thirdPlaceEntryId ? { id: thirdPlaceEntryId, name: names.get(thirdPlaceEntryId) ?? 'Unknown' } : null,
  } as const;
}

// ── Finalize category results ──────────────────────────────────────────────────
// Derives winner / runner-up / 3rd place from the completed bracket and marks
// the category as 'completed'. Safe to call multiple times (idempotent).
export async function finalizeCategoryResultsAction(categoryId: string) {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return { error: 'Not authenticated' };

  const result = await deriveCategoryResults(categoryId, user.id);
  if ('error' in result) return { error: result.error };

  const { cat, tournament, winnerEntryId, runnerUpEntryId, thirdPlaceEntryId } = result;
  const admin = createAdminClient();

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
