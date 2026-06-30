'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient, createClient, getCurrentUser } from '@/lib/supabase/server';
import { detectConflictsFromUpdates, resolveCategoryDurationMins } from '@/lib/scheduling-utils';
import type { ScheduleUpdate, ConflictInfo, SmartScheduleParams } from '@/lib/scheduling-utils';
// Type-only re-export — erases at runtime, allowed in 'use server' files.
export type { ScheduleUpdate, ConflictInfo, SmartScheduleParams } from '@/lib/scheduling-utils';

// ── Existing save action ──────────────────────────────────────────────────────

export async function batchScheduleMatchesAction(
  tournamentSlug: string,
  updates: ScheduleUpdate[],
) {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return { error: 'Not authenticated' };

  if (updates.length === 0) return { success: true, count: 0 };

  const admin = createAdminClient();

  const { data: t } = await admin
    .from('tournaments')
    .select('id, club_id, court_count')
    .eq('slug', tournamentSlug)
    .single();
  if (!t) return { error: 'Tournament not found' };

  const { data: mgr } = await admin
    .from('club_managers')
    .select('role')
    .eq('club_id', t.club_id)
    .eq('player_id', user.id)
    .maybeSingle();
  if (!mgr) return { error: 'Permission denied' };

  const results = await Promise.all(
    updates.map((u) =>
      admin
        .from('matches')
        .update({ scheduled_time: u.scheduledTime ?? null, court: u.court ?? null })
        .eq('id', u.matchId)
        .eq('tournament_id', t.id),
    ),
  );

  const failed = results.filter((r) => r.error);
  if (failed.length > 0) {
    return { error: `${failed.length} update(s) failed: ${failed[0].error?.message}` };
  }

  revalidatePath(`/tournaments/${tournamentSlug}/schedule`);
  revalidatePath(`/tournaments/${tournamentSlug}/scoring`);
  revalidatePath(`/tournaments/${tournamentSlug}/analytics`);
  return { success: true, count: updates.length };
}

// ── Reset one category's schedule (court/time only — leaves day/order alone) ──
export async function resetCategoryScheduleAction(
  tournamentSlug: string,
  categoryId: string,
): Promise<{ success: true; count: number } | { error: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: 'Not authenticated' };

  const admin = createAdminClient();

  const { data: t } = await admin
    .from('tournaments')
    .select('id, club_id')
    .eq('slug', tournamentSlug)
    .single();
  if (!t) return { error: 'Tournament not found' };

  const { data: mgr } = await admin
    .from('club_managers')
    .select('role')
    .eq('club_id', t.club_id)
    .eq('player_id', user.id)
    .maybeSingle();
  if (!mgr) return { error: 'Permission denied' };

  const { data: cleared, error } = await admin
    .from('matches')
    .update({ scheduled_time: null, court: null })
    .eq('tournament_id', t.id)
    .eq('category_id', categoryId)
    .select('id');
  if (error) return { error: `Failed to reset schedule: ${error.message}` };

  revalidatePath(`/tournaments/${tournamentSlug}/schedule`);
  revalidatePath(`/tournaments/${tournamentSlug}/scoring`);
  return { success: true, count: cleared?.length ?? 0 };
}

// ── Category schedule order (day + sequence) ──────────────────────────────────

export interface CategoryScheduleAssignment {
  categoryId: string;
  /** "YYYY-MM-DD" — which day this category's matches should run on */
  day: string;
  /** Position within that day, relative to other categories (0 = first) */
  order: number;
}

/**
 * Saves which day each category is scheduled on and in what order, then
 * clears every match's existing court/time in this tournament — re-arranging
 * the running order invalidates whatever schedule was already generated, so
 * the organiser is forced to re-run "Schedule all matches" against the new order.
 */
export async function updateCategoryScheduleOrderAction(
  tournamentSlug: string,
  assignments: CategoryScheduleAssignment[],
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return { error: 'Not authenticated' };

  const admin = createAdminClient();

  const { data: t } = await admin
    .from('tournaments')
    .select('id, club_id')
    .eq('slug', tournamentSlug)
    .single();
  if (!t) return { error: 'Tournament not found' };

  const { data: mgr } = await admin
    .from('club_managers')
    .select('role')
    .eq('club_id', t.club_id)
    .eq('player_id', user.id)
    .maybeSingle();
  if (!mgr) return { error: 'Permission denied' };

  const results = await Promise.all(
    assignments.map((a) =>
      admin
        .from('tournament_categories')
        .update({ schedule_day: a.day, schedule_order: a.order })
        .eq('id', a.categoryId)
        .eq('tournament_id', t.id),
    ),
  );
  const failed = results.filter((r) => r.error);
  if (failed.length > 0) {
    return { error: `Failed to save category order: ${failed[0].error?.message}` };
  }

  // Reset every match's court/time — the previously generated schedule no
  // longer reflects the new running order and would be misleading to keep.
  const { error: clearError } = await admin
    .from('matches')
    .update({ scheduled_time: null, court: null })
    .eq('tournament_id', t.id);
  if (clearError) return { error: `Failed to reset existing schedule: ${clearError.message}` };

  revalidatePath(`/tournaments/${tournamentSlug}/schedule`);
  revalidatePath(`/tournaments/${tournamentSlug}/scoring`);
  return { success: true };
}

// ── Smart schedule generator ──────────────────────────────────────────────────

/**
 * Generates a conflict-free schedule for all schedulable matches in a tournament.
 *
 * Rules:
 * 1. All matches in one group → same court, sequential (one after another)
 * 2. Different groups → different courts (round-robin across availableCourts)
 * 3. Knockout only starts after every group-stage match has finished
 * 4. Within knockout: each round's matches are distributed across courts in parallel
 */
export async function generateSmartScheduleAction(
  tournamentSlug: string,
  params: SmartScheduleParams,
): Promise<{ updates: ScheduleUpdate[]; conflicts: ConflictInfo[] } | { error: string }> {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return { error: 'Not authenticated' };

  const admin = createAdminClient();

  const { data: t } = await admin
    .from('tournaments')
    .select('id, club_id, scoring_format, num_sets')
    .eq('slug', tournamentSlug)
    .single();
  if (!t) return { error: 'Tournament not found' };

  const { data: mgr } = await admin
    .from('club_managers')
    .select('role')
    .eq('club_id', t.club_id)
    .eq('player_id', user.id)
    .maybeSingle();
  if (!mgr) return { error: 'Permission denied' };

  // Fetch all schedulable matches for this tournament — including knockout
  // matches whose participants aren't decided yet (group stage in progress,
  // or an earlier knockout round unresolved); only id/round/category_id are
  // used below, so placeholder matches schedule exactly like real ones.
  const { data: rawMatches } = await admin
    .from('matches')
    .select('id, round, group_name, category_id, status, winner_entry_id, tie_id, rubber_sequence, is_decider')
    .eq('tournament_id', t.id)
    .order('group_name', { ascending: true, nullsFirst: false })
    .order('round', { ascending: true });

  if (!rawMatches || rawMatches.length === 0) {
    return { updates: [], conflicts: [] };
  }

  type M = {
    id: string; round: number; group_name: string | null; category_id: string; status: string; winner_entry_id: string | null;
    tie_id: string | null; rubber_sequence: number | null; is_decider: boolean;
  };
  const allMatches = rawMatches as M[];

  // A team-event tie's rubbers always play on the same court, back-to-back,
  // in their configured order — group them into one schedulable "block" so
  // the rest of the algorithm places the whole tie as a single unit instead
  // of scattering its rubbers across different courts/times like
  // independent matches.
  type Block = { id: string; round: number; group_name: string | null; matches: M[] };
  function buildBlocks(matches: M[]): Block[] {
    const blocks: Block[] = [];
    const tieBlockByTieId = new Map<string, Block>();
    for (const m of matches) {
      if (m.tie_id) {
        let block = tieBlockByTieId.get(m.tie_id);
        if (!block) {
          block = { id: `tie:${m.tie_id}`, round: m.round, group_name: m.group_name, matches: [] };
          tieBlockByTieId.set(m.tie_id, block);
          blocks.push(block);
        }
        block.matches.push(m);
      } else {
        blocks.push({ id: m.id, round: m.round, group_name: m.group_name, matches: [m] });
      }
    }
    for (const block of blocks) {
      block.matches.sort((a, b) => {
        if (a.is_decider !== b.is_decider) return a.is_decider ? 1 : -1;
        return (a.rubber_sequence ?? 0) - (b.rubber_sequence ?? 0);
      });
    }
    return blocks;
  }

  const { availableCourts, matchDurationMins, changeoverMins, knockoutBufferMins } = params;
  if (availableCourts.length === 0) return { error: 'No courts available' };

  // Categories can override the tournament's scoring format/set count (e.g.
  // singles best-of-3 vs. doubles best-of-1) — each gets its own match
  // duration instead of one tournament-wide value, so multi-category
  // tournaments pack correctly instead of over/under-estimating slot length.
  // schedule_day/schedule_order (set via the drag-and-drop category-order UI)
  // determine which day a category runs on and its sequence within that day.
  const { data: cats } = await admin
    .from('tournament_categories')
    .select('id, scoring_override, scoring_format, num_sets, schedule_day, schedule_order, created_at')
    .eq('tournament_id', t.id)
    .order('schedule_order', { ascending: true })
    .order('created_at', { ascending: true });
  const tournamentDefaults = {
    scoringFormat: (t.scoring_format ?? 'rally') as 'rally' | 'traditional',
    numSets: t.num_sets ?? 1,
  };
  const durationByCategoryId = new Map<string, number>(
    (cats ?? []).map((c) => [c.id, resolveCategoryDurationMins(c, tournamentDefaults, changeoverMins)]),
  );
  // Falls back to the popup's manual duration only for a category with no
  // resolvable scoring config at all (shouldn't normally happen).
  function durationFor(m: M): number {
    return durationByCategoryId.get(m.category_id) ?? matchDurationMins;
  }

  const bufferMs = knockoutBufferMins * 60_000;
  const startDate = params.startDatetime.slice(0, 10);
  const startTimeOfDay = params.startDatetime.slice(10); // "THH:MM..."

  const updates: ScheduleUpdate[] = [];

  // ── Group categories by day, ordered within each day ──────────────────────────
  // Categories without an explicit schedule_day default to the tournament's
  // start date, in their stored (or creation) order — so tournaments that
  // haven't used the new ordering UI yet schedule exactly as before.
  const categoryOrder = (cats ?? []).map((c) => c.id);
  const dayByCategoryId = new Map<string, string>(
    (cats ?? []).map((c) => [c.id, c.schedule_day ?? startDate]),
  );
  const matchesByCategoryId = new Map<string, M[]>();
  for (const m of allMatches) {
    if (m.status === 'walkover' || m.status === 'retired') continue;
    if (!matchesByCategoryId.has(m.category_id)) matchesByCategoryId.set(m.category_id, []);
    matchesByCategoryId.get(m.category_id)!.push(m);
  }

  const daysInOrder = [...new Set(categoryOrder.map((id) => dayByCategoryId.get(id) ?? startDate))].sort();

  for (const day of daysInOrder) {
    const dayStartMs = new Date(`${day}${startTimeOfDay}`).getTime();

    // Track when each court is next free *within this day* (ms timestamp)
    const courtFreeAt: Map<number, number> = new Map(availableCourts.map((c) => [c, dayStartMs]));
    let categoryStartMs = dayStartMs;

    const categoriesThisDay = categoryOrder.filter((id) => (dayByCategoryId.get(id) ?? startDate) === day);

    for (const categoryId of categoriesThisDay) {
      const categoryMatches = matchesByCategoryId.get(categoryId) ?? [];
      if (categoryMatches.length === 0) continue;

      // The whole category starts no earlier than where the previous
      // category on this day left every court — "next category starts once
      // the slot is emptied by the previous category."
      for (const c of availableCourts) courtFreeAt.set(c, categoryStartMs);

      const groupMatches    = categoryMatches.filter((m) => m.group_name !== null);
      const knockoutMatches = categoryMatches.filter((m) => m.group_name === null);

      // ── Group stage: each group → one court, sequential ──────────────────────
      // Team-event ties are scheduled as one block (all rubbers back-to-back
      // on the block's assigned court) rather than one independent match per
      // rubber — buildBlocks() collapses same-tie_id rows together.
      const groupBlockMap = new Map<string, Block[]>();
      for (const block of buildBlocks(groupMatches)) {
        const key = block.group_name as string;
        if (!groupBlockMap.has(key)) groupBlockMap.set(key, []);
        groupBlockMap.get(key)!.push(block);
      }
      const sortedGroupNames = [...groupBlockMap.keys()].sort();

      let groupCursor = 0;
      let lastGroupEndMs = categoryStartMs;

      for (const groupName of sortedGroupNames) {
        const grp   = (groupBlockMap.get(groupName) ?? []).sort((a, b) => a.round - b.round);
        const court = availableCourts[groupCursor % availableCourts.length];
        groupCursor++;

        let t_ms = courtFreeAt.get(court) ?? categoryStartMs;
        for (const block of grp) {
          for (const m of block.matches) {
            updates.push({ matchId: m.id, scheduledTime: new Date(t_ms).toISOString(), court });
            t_ms += (durationFor(m) + changeoverMins) * 60_000;
          }
        }
        courtFreeAt.set(court, t_ms);
        lastGroupEndMs = Math.max(lastGroupEndMs, t_ms);
      }

      // ── Knockout: each round distributed across courts in parallel ──────────
      if (knockoutMatches.length > 0) {
        const knockoutStart = groupMatches.length > 0 ? lastGroupEndMs + bufferMs : categoryStartMs;
        for (const c of availableCourts) courtFreeAt.set(c, knockoutStart);

        const knockoutBlocks = buildBlocks(knockoutMatches);
        const rounds = [...new Set(knockoutBlocks.map((b) => b.round))].sort((a, b) => a - b);
        for (const round of rounds) {
          const roundBlocks = knockoutBlocks.filter((b) => b.round === round);
          const roundStartMs = Math.max(...availableCourts.map((c) => courtFreeAt.get(c) ?? knockoutStart));

          let courtCursor = 0;
          for (const block of roundBlocks) {
            const court = availableCourts[courtCursor % availableCourts.length];
            courtCursor++;
            let t_ms = Math.max(courtFreeAt.get(court) ?? roundStartMs, roundStartMs);
            for (const m of block.matches) {
              updates.push({ matchId: m.id, scheduledTime: new Date(t_ms).toISOString(), court });
              t_ms += (durationFor(m) + changeoverMins) * 60_000;
            }
            courtFreeAt.set(court, t_ms);
          }
        }
      }

      // Next category on this day starts once every court is free of this one.
      categoryStartMs = Math.max(...availableCourts.map((c) => courtFreeAt.get(c) ?? categoryStartMs));
    }
  }

  // ── Detect conflicts (court + time overlap) ───────────────────────────────────
  const durationByMatchId = new Map(allMatches.map((m) => [m.id, durationFor(m)]));
  const conflicts = detectConflictsFromUpdates(updates, durationByMatchId, availableCourts);

  return { updates, conflicts };
}

// ── Dynamic court count adjustment ────────────────────────────────────────────

/**
 * Updates the available court count for a tournament.
 * Returns match IDs that are now on an out-of-range court (court > newCourtCount).
 */
export async function updateCourtCountAction(
  tournamentSlug: string,
  newCourtCount: number,
): Promise<{ success: true; invalidatedMatchIds: string[] } | { error: string }> {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return { error: 'Not authenticated' };

  const admin = createAdminClient();

  const { data: t } = await admin
    .from('tournaments')
    .select('id, club_id')
    .eq('slug', tournamentSlug)
    .single();
  if (!t) return { error: 'Tournament not found' };

  const { data: mgr } = await admin
    .from('club_managers')
    .select('role')
    .eq('club_id', t.club_id)
    .eq('player_id', user.id)
    .maybeSingle();
  if (!mgr) return { error: 'Permission denied' };

  const { error } = await admin
    .from('tournaments')
    .update({ court_count: newCourtCount })
    .eq('id', t.id);

  if (error) return { error: error.message };

  // Find matches now on invalid courts
  const { data: invalidMatches } = await admin
    .from('matches')
    .select('id')
    .eq('tournament_id', t.id)
    .gt('court', newCourtCount)
    .not('court', 'is', null);

  revalidatePath(`/tournaments/${tournamentSlug}/schedule`);
  revalidatePath(`/tournaments/${tournamentSlug}/scoring`);

  return {
    success: true,
    invalidatedMatchIds: (invalidMatches ?? []).map((m) => (m as { id: string }).id),
  };
}
