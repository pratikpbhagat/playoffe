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
    .select('id, round, group_name, category_id, status, winner_entry_id')
    .eq('tournament_id', t.id)
    .order('group_name', { ascending: true, nullsFirst: false })
    .order('round', { ascending: true });

  if (!rawMatches || rawMatches.length === 0) {
    return { updates: [], conflicts: [] };
  }

  type M = { id: string; round: number; group_name: string | null; category_id: string; status: string; winner_entry_id: string | null };
  const allMatches = rawMatches as M[];

  const { availableCourts, matchDurationMins, changeoverMins, knockoutBufferMins } = params;
  if (availableCourts.length === 0) return { error: 'No courts available' };

  // Categories can override the tournament's scoring format/set count (e.g.
  // singles best-of-3 vs. doubles best-of-1) — each gets its own match
  // duration instead of one tournament-wide value, so multi-category
  // tournaments pack correctly instead of over/under-estimating slot length.
  const { data: cats } = await admin
    .from('tournament_categories')
    .select('id, scoring_override, scoring_format, num_sets')
    .eq('tournament_id', t.id);
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

  const updates: ScheduleUpdate[] = [];

  // ── Separate group-stage and knockout matches ────────────────────────────────
  const groupMatches   = allMatches.filter((m) => m.group_name !== null && m.status !== 'walkover' && m.status !== 'retired');
  const knockoutMatches = allMatches.filter((m) => m.group_name === null && m.status !== 'walkover' && m.status !== 'retired');

  // ── Schedule group-stage: each group → one court, sequential ─────────────────
  // Build: Map<groupKey, match[]> where groupKey = `${category_id}::${group_name}`
  const groupMap = new Map<string, M[]>();
  for (const m of groupMatches) {
    const key = `${m.category_id}::${m.group_name}`;
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key)!.push(m);
  }

  // Sort groups alphabetically by group_name within category
  const sortedGroupKeys = [...groupMap.keys()].sort((a, b) => {
    const [catA, gnA] = a.split('::');
    const [catB, gnB] = b.split('::');
    if (catA !== catB) return catA.localeCompare(catB);
    return (gnA ?? '').localeCompare(gnB ?? '');
  });

  // Track when each court is next free (ms timestamp)
  const courtFreeAt: Map<number, number> = new Map(
    availableCourts.map((c) => [c, new Date(params.startDatetime).getTime()]),
  );

  let groupCursor = 0;
  let lastGroupEndMs = 0;

  for (const key of sortedGroupKeys) {
    const groupMs = allMatches;
    const grp     = (groupMap.get(key) ?? []).sort((a, b) => a.round - b.round);
    const court   = availableCourts[groupCursor % availableCourts.length];
    groupCursor++;

    // This group's matches run sequentially starting when the court is free
    let t_ms = courtFreeAt.get(court) ?? new Date(params.startDatetime).getTime();

    for (const m of grp) {
      updates.push({
        matchId:       m.id,
        scheduledTime: new Date(t_ms).toISOString(),
        court,
      });
      t_ms += (durationFor(m) + changeoverMins) * 60_000;
    }

    courtFreeAt.set(court, t_ms);
    lastGroupEndMs = Math.max(lastGroupEndMs, t_ms);
  }

  // ── Schedule knockout: each round distributed across courts ──────────────────
  if (knockoutMatches.length > 0) {
    const knockoutStart = lastGroupEndMs > 0
      ? lastGroupEndMs + bufferMs
      : new Date(params.startDatetime).getTime();

    // Reset all courts to knockoutStart
    for (const c of availableCourts) {
      courtFreeAt.set(c, knockoutStart);
    }

    // Get unique rounds in order
    const rounds = [...new Set(knockoutMatches.map((m) => m.round))].sort((a, b) => a - b);

    for (const round of rounds) {
      const roundMatches = knockoutMatches.filter((m) => m.round === round);
      const roundStartMs = Math.max(...availableCourts.map((c) => courtFreeAt.get(c) ?? knockoutStart));

      let courtCursor = 0;
      for (const m of roundMatches) {
        const court = availableCourts[courtCursor % availableCourts.length];
        courtCursor++;
        const t_ms = Math.max(courtFreeAt.get(court) ?? roundStartMs, roundStartMs);
        updates.push({
          matchId:       m.id,
          scheduledTime: new Date(t_ms).toISOString(),
          court,
        });
        courtFreeAt.set(court, t_ms + (durationFor(m) + changeoverMins) * 60_000);
      }
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
