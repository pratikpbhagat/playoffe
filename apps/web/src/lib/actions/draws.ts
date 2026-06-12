'use server';

import { revalidatePath } from 'next/cache';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { generateDraw } from '@pickleball/draw-engine';
import type { DrawConfig, DrawEntry } from '@pickleball/shared';
import { createNotificationsForPlayers } from './notifications';

// ── Auth guard ────────────────────────────────────────────────────────────────
async function assertCategoryManager(categoryId: string, userId: string) {
  const admin = createAdminClient();

  const { data: cat } = await admin
    .from('tournament_categories')
    .select('id, name, tournament_id, draw_format, slug, max_entries, groups_count, group_sizes, advance_per_group, has_third_place_match, knockout_seeding, tournaments!inner(id, club_id, slug, court_count)')
    .eq('id', categoryId)
    .single();
  if (!cat) return null;

  const tData = cat.tournaments as { id: string; club_id: string; slug: string; court_count: number };

  const { data: mgr } = await admin
    .from('club_managers')
    .select('role')
    .eq('club_id', tData.club_id)
    .eq('player_id', userId)
    .maybeSingle();

  return mgr ? { ...cat, tournamentData: tData } : null;
}

// ── Generate draw ─────────────────────────────────────────────────────────────
export async function generateDrawAction(
  categoryId: string,
  /** Optional per-group sizes override — used when the organiser re-assigns
   *  the extra player at draw-generation time (actual entry count may differ
   *  from max_entries). When provided, these sizes are also persisted to the DB. */
  groupSizesOverride?: number[],
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const admin = createAdminClient();
  const cat = await assertCategoryManager(categoryId, user.id);
  if (!cat) return { error: 'Permission denied' };

  // Fetch active entries with player info
  const { data: entries, error: entryErr } = await admin
    .from('tournament_entries')
    .select(
      'id, seed, players!player_id(id, full_name, username, global_stats(current_rating))',
    )
    .eq('category_id', categoryId)
    .eq('status', 'active');

  if (entryErr || !entries) return { error: 'Failed to fetch entries' };
  if (entries.length < 2) return { error: 'Need at least 2 entries to generate a draw' };

  // Map to DrawEntry[]
  const drawEntries: DrawEntry[] = entries.map((e) => {
    const player = e.players as {
      id: string;
      full_name: string;
      username: string;
      global_stats: { current_rating: number } | null;
    } | null;
    return {
      entry_id: e.id,
      player_ids: player ? [player.id] : [],
      display_name: player?.full_name ?? 'Unknown',
      seed: e.seed,
      rating: player?.global_stats?.current_rating ?? 3.5,
    };
  });

  // For group_stage_knockout, derive group sizing from stored config
  const catAny = cat as typeof cat & {
    max_entries?: number | null;
    groups_count?: number | null;
    group_sizes?: number[] | null;
    advance_per_group?: number | null;
    has_third_place_match?: boolean | null;
    knockout_seeding?: 'auto' | 'manual' | null;
  };
  const groupsCount = catAny.groups_count ?? null;
  const storedGroupSizes = catAny.group_sizes ?? null;
  const groupSize = groupsCount && catAny.max_entries
    ? Math.ceil(catAny.max_entries / groupsCount)
    : 4; // default group size

  // Resolve final group sizes: override > stored > derived
  const resolvedGroupSizes = groupSizesOverride ?? (storedGroupSizes?.length ? storedGroupSizes : null);

  // Persist the resolved sizes so the draw is reproducible
  if (resolvedGroupSizes) {
    await (createAdminClient() as any)
      .from('tournament_categories')
      .update({ group_sizes: resolvedGroupSizes })
      .eq('id', categoryId);
  }

  // Generate the draw
  const config: DrawConfig = {
    format: cat.draw_format as DrawConfig['format'],
    entries: drawEntries,
    category_id: categoryId,
    group_size: groupSize,
    ...(resolvedGroupSizes && { group_sizes: resolvedGroupSizes }),
    top_per_group_advance: catAny.advance_per_group ?? 2,
    has_third_place_match: catAny.has_third_place_match ?? false,
    knockout_seeding: catAny.knockout_seeding ?? 'auto',
  };

  let draw;
  try {
    draw = generateDraw(config);
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to generate draw' };
  }

  // Clear any existing matches first
  await admin.from('matches').delete().eq('category_id', categoryId);

  // Bulk insert all matches – include DE advancement columns when present
  type MatchInsert = {
    id: string;
    tournament_id: string;
    category_id: string;
    round: number;
    round_name: string | null;
    group_name: string | null;
    entry_a_id: string | null;
    entry_b_id: string | null;
    status: 'scheduled';
    sets: never[];
    bracket_position: number;
    bracket_type?: string | null;
    winner_to_match_id?: string | null;
    loser_to_match_id?: string | null;
    winner_slot?: string | null;
    loser_slot?: string | null;
  };

  const matchInserts: MatchInsert[] = draw.rounds.flatMap((r) =>
    r.matches.map((m, positionInRound) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ext = m as any;
      return {
        id: m.id,
        tournament_id: cat.tournament_id,
        category_id: categoryId,
        round: m.round,
        round_name: m.round_name,
        group_name: m.group_name,
        entry_a_id: m.entry_a?.entry_id ?? null,
        entry_b_id: m.entry_b?.entry_id ?? null,
        status: 'scheduled' as const,
        sets: [],
        bracket_position: positionInRound,
        // DE / explicit-advancement fields (undefined → omitted for non-DE formats)
        bracket_type:        ext._bracket_type        ?? null,
        winner_to_match_id:  ext._winner_to_match_id  ?? null,
        loser_to_match_id:   ext._loser_to_match_id   ?? null,
        winner_slot:         ext._winner_slot          ?? null,
        loser_slot:          ext._loser_slot           ?? null,
      };
    }),
  );

  const { error: insertErr } = await admin.from('matches').insert(matchInserts);
  if (insertErr) return { error: `Failed to save draw matches: ${insertErr.message}` };

  // ── Auto-advance byes ────────────────────────────────────────────────────
  const isElimination =
    cat.draw_format === 'single_elimination' || cat.draw_format === 'double_elimination';

  if (isElimination) {
    const byeMatches = matchInserts.filter(
      (m) => (m.entry_a_id === null || m.entry_b_id === null)
        && (m.entry_a_id !== null || m.entry_b_id !== null) // at least one real entry
        && (m.bracket_type === 'winners' || m.bracket_type === null), // only WB byes
    );

    for (const bye of byeMatches) {
      const winnerEntryId = bye.entry_a_id ?? bye.entry_b_id;
      if (!winnerEntryId) continue;

      await admin
        .from('matches')
        .update({ status: 'walkover', winner_entry_id: winnerEntryId, completed_at: new Date().toISOString() })
        .eq('id', bye.id);

      // Advance winner using explicit link (DE) or positional (SE)
      if (bye.winner_to_match_id && bye.winner_slot) {
        const slot = bye.winner_slot === 'a' ? 'entry_a_id' : 'entry_b_id';
        await admin.from('matches').update({ [slot]: winnerEntryId }).eq('id', bye.winner_to_match_id);
      } else {
        const nextPos = Math.floor(bye.bracket_position / 2);
        const slot = bye.bracket_position % 2 === 0 ? 'entry_a_id' : 'entry_b_id';
        const { data: nextMatch } = await admin
          .from('matches')
          .select('id')
          .eq('category_id', categoryId)
          .eq('round', bye.round + 1)
          .eq('bracket_position', nextPos)
          .maybeSingle();
        if (nextMatch) {
          await admin.from('matches').update({ [slot]: winnerEntryId }).eq('id', nextMatch.id);
        }
      }
    }
  }

  // Update category status
  await admin
    .from('tournament_categories')
    .update({ status: 'draw_generated' })
    .eq('id', categoryId);

  const tSlug = cat.tournamentData.slug;
  revalidatePath(`/tournaments/${tSlug}/categories/${cat.slug}`);

  // Notify all active participants that the draw is ready
  const { data: activeEntries } = await admin
    .from('tournament_entries')
    .select('player_id')
    .eq('category_id', categoryId)
    .eq('status', 'active');

  if (activeEntries && activeEntries.length > 0) {
    const playerIds = [...new Set(activeEntries.map((e) => e.player_id))];
    void createNotificationsForPlayers(
      playerIds,
      'draw_published',
      'Draw is ready',
      `The draw for ${cat.name} has been published. Check your matches!`,
      `/events/${tSlug}/draw/${cat.slug}`,
    );
  }

  return { success: true, matchCount: matchInserts.length };
}

// ── Clear draw (for regenerate) ───────────────────────────────────────────────
export async function clearDrawAction(categoryId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const cat = await assertCategoryManager(categoryId, user.id);
  if (!cat) return { error: 'Permission denied' };

  const admin = createAdminClient();

  // Block regeneration if any match has started
  const { data: startedMatches } = await admin
    .from('matches')
    .select('id')
    .eq('category_id', categoryId)
    .neq('status', 'scheduled')
    .limit(1);
  if (startedMatches && startedMatches.length > 0) {
    return { error: 'Cannot regenerate — one or more matches have already started. Use Adjust draw instead.' };
  }

  await admin.from('matches').delete().eq('category_id', categoryId);
  await admin
    .from('tournament_categories')
    .update({ status: 'registration' })
    .eq('id', categoryId);

  const tSlug = cat.tournamentData.slug;
  revalidatePath(`/tournaments/${tSlug}/categories/${cat.slug}`);
  return { success: true };
}

// ── Auto-schedule courts ──────────────────────────────────────────────────────
// Distributes all "scheduled" matches across available courts, round by round.
// Within each round, matches cycle through courts 1..courtCount.
// Optionally assigns estimated start times if startTime + matchDurationMins provided.
export async function scheduleMatchesAction(
  categoryId: string,
  options?: { startTime?: string; matchDurationMins?: number },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const cat = await assertCategoryManager(categoryId, user.id);
  if (!cat) return { error: 'Permission denied' };

  const courtCount = cat.tournamentData.court_count ?? 1;

  const admin = createAdminClient();

  // Fetch all non-bye scheduled matches ordered by round
  const { data: matches } = await admin
    .from('matches')
    .select('id, round, entry_a_id, entry_b_id')
    .eq('category_id', categoryId)
    .in('status', ['scheduled'])
    .not('entry_a_id', 'is', null)
    .not('entry_b_id', 'is', null)
    .order('round', { ascending: true })
    .order('bracket_position', { ascending: true });

  if (!matches || matches.length === 0) return { error: 'No schedulable matches found' };

  const startMs = options?.startTime ? new Date(options.startTime).getTime() : null;
  const durMs = (options?.matchDurationMins ?? 30) * 60 * 1000;

  // Assign courts round-by-round
  let courtCounter = 0;
  let globalMatchIndex = 0;
  let currentRound = matches[0].round;
  let roundStartGlobalIndex = 0;

  const updates: { id: string; court: number; scheduled_time: string | null }[] = [];

  for (const match of matches) {
    if (match.round !== currentRound) {
      // New round — reset court counter, advance time past the whole previous round
      courtCounter = 0;
      currentRound = match.round;
      roundStartGlobalIndex = globalMatchIndex;
    }

    const court = (courtCounter % courtCount) + 1;

    let scheduledTime: string | null = null;
    if (startMs !== null) {
      // How many "slots" deep are we within this round on this court?
      const matchesPerCourt = Math.ceil(
        matches.filter((m) => m.round === currentRound).length / courtCount,
      );
      // Round offset: how many complete rounds before this
      const roundsCompleted = matches.filter((m) => m.round < currentRound).length === 0
        ? 0
        : Math.max(...matches.filter((m) => m.round < currentRound).map((m) => m.round));

      // Simplified: each round starts after the previous round finishes
      // (assume all courts run simultaneously per round)
      const prevRoundMatchCount = matches.filter((m) => m.round < currentRound).length;
      const prevRoundSlots = courtCount > 0 ? Math.ceil(prevRoundMatchCount / courtCount) : 0;
      const slotInRound = Math.floor(courtCounter / courtCount);
      void matchesPerCourt; void roundsCompleted; void prevRoundSlots;

      scheduledTime = new Date(startMs + slotInRound * durMs).toISOString();
    }

    updates.push({ id: match.id, court, scheduled_time: scheduledTime });

    courtCounter++;
    globalMatchIndex++;
  }

  // Batch update
  for (const u of updates) {
    await admin
      .from('matches')
      .update({ court: u.court, ...(u.scheduled_time ? { scheduled_time: u.scheduled_time } : {}) })
      .eq('id', u.id);
  }

  const tSlug = cat.tournamentData.slug;
  revalidatePath(`/tournaments/${tSlug}/categories/${cat.slug}`);
  revalidatePath(`/tournaments/${tSlug}/scoring`);
  return { success: true, scheduled: updates.length };
}

// ── Generate next Swiss round ─────────────────────────────────────────────────
// Reads actual match results from the DB, computes standings, pairs players by
// Swiss rules (closest score, no repeat opponents if possible), and inserts the
// new round's matches.
export async function generateNextSwissRoundAction(categoryId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const cat = await assertCategoryManager(categoryId, user.id);
  if (!cat) return { error: 'Permission denied' };

  const admin = createAdminClient();

  // Fetch all matches for this category
  const { data: allMatches } = await admin
    .from('matches')
    .select('id, round, status, entry_a_id, entry_b_id, winner_entry_id')
    .eq('category_id', categoryId)
    .order('round', { ascending: true });

  if (!allMatches || allMatches.length === 0) return { error: 'No matches found — generate the draw first' };

  const maxRound = Math.max(...allMatches.map((m) => m.round));
  const currentRoundMatches = allMatches.filter((m) => m.round === maxRound);
  const allComplete = currentRoundMatches.every(
    (m) => m.status === 'completed' || m.status === 'walkover',
  );
  if (!allComplete) return { error: 'Not all matches in the current round are complete' };

  // Fetch active entries
  const { data: entries } = await admin
    .from('tournament_entries')
    .select('id, seed, players!player_id(global_stats(current_rating))')
    .eq('category_id', categoryId)
    .eq('status', 'active');

  if (!entries || entries.length < 2) return { error: 'Not enough active entries' };

  // Build standings & opponents-faced maps
  type Standing = { entryId: string; wins: number; losses: number; seed: number | null; rating: number };
  const standingsMap = new Map<string, Standing>();
  const opponentsFaced = new Map<string, Set<string>>();

  for (const e of entries) {
    const player = e.players as { global_stats: { current_rating: number } | null } | null;
    standingsMap.set(e.id, {
      entryId: e.id,
      wins: 0,
      losses: 0,
      seed: e.seed ?? null,
      rating: player?.global_stats?.current_rating ?? 3.5,
    });
    opponentsFaced.set(e.id, new Set());
  }

  // Process all historical matches
  for (const m of allMatches) {
    if (m.status !== 'completed' && m.status !== 'walkover') continue;

    if (m.entry_a_id && m.entry_b_id) {
      // Real match — track opponents and update win/loss
      opponentsFaced.get(m.entry_a_id)?.add(m.entry_b_id);
      opponentsFaced.get(m.entry_b_id)?.add(m.entry_a_id);
      if (m.winner_entry_id) {
        const winner = standingsMap.get(m.winner_entry_id);
        if (winner) winner.wins++;
        const loserId = m.winner_entry_id === m.entry_a_id ? m.entry_b_id : m.entry_a_id;
        const loser = standingsMap.get(loserId);
        if (loser) loser.losses++;
      }
    } else {
      // Bye — winner gets a win, no opponent tracked
      if (m.winner_entry_id) {
        const standing = standingsMap.get(m.winner_entry_id);
        if (standing) standing.wins++;
      }
    }
  }

  // Sort by wins desc → rating desc (tiebreak)
  const sorted = [...standingsMap.values()].sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    return b.rating - a.rating;
  });

  // Greedy Swiss pairing
  const paired = new Set<string>();
  const newMatchPairs: { entryA: string; entryB: string | null }[] = [];

  for (const player of sorted) {
    if (paired.has(player.entryId)) continue;

    let opponent: Standing | null = null;

    // First pass: prefer unpaired opponent not previously faced
    for (const candidate of sorted) {
      if (candidate.entryId === player.entryId) continue;
      if (paired.has(candidate.entryId)) continue;
      if (opponentsFaced.get(player.entryId)?.has(candidate.entryId)) continue;
      opponent = candidate;
      break;
    }

    // Second pass: allow rematch if no fresh opponent is available
    if (!opponent) {
      for (const candidate of sorted) {
        if (candidate.entryId === player.entryId) continue;
        if (paired.has(candidate.entryId)) continue;
        opponent = candidate;
        break;
      }
    }

    paired.add(player.entryId);
    if (opponent) {
      paired.add(opponent.entryId);
      newMatchPairs.push({ entryA: player.entryId, entryB: opponent.entryId });
    } else {
      newMatchPairs.push({ entryA: player.entryId, entryB: null }); // bye
    }
  }

  const nextRound = maxRound + 1;
  const roundName = `Round ${nextRound}`;

  const matchInserts = newMatchPairs.map((pair, i) => ({
    id: crypto.randomUUID(),
    tournament_id: cat.tournament_id,
    category_id: categoryId,
    round: nextRound,
    round_name: roundName,
    group_name: null,
    entry_a_id: pair.entryA,
    entry_b_id: pair.entryB,
    status: 'scheduled' as const,
    sets: [] as never[],
    bracket_position: i,
  }));

  const { error: insertErr } = await admin.from('matches').insert(matchInserts);
  if (insertErr) return { error: `Failed to insert matches: ${insertErr.message}` };

  const tSlug = cat.tournamentData.slug;
  revalidatePath(`/tournaments/${tSlug}/categories/${cat.slug}`);
  return { success: true, round: nextRound, matchCount: matchInserts.length };
}

// ── Fetch matches with player details ─────────────────────────────────────────
export type MatchWithPlayers = {
  id: string;
  round: number;
  round_name: string | null;
  group_name: string | null;
  bracket_type: string | null;
  status: string;
  winner_entry_id: string | null;
  sets: unknown;
  court: number | null;
  entry_a: {
    entry_status?: string; // 'active' | 'withdrawn' | etc.
    id: string;
    seed: number | null;
    player_name: string;
    partner_name: string | null;
    player_username: string;
  } | null;
  entry_b: {
    id: string;
    seed: number | null;
    player_name: string;
    partner_name: string | null;
    player_username: string;
    entry_status?: string;
  } | null;
};

// ── Swap two draw entries ─────────────────────────────────────────────────────
// Atomically swaps entryId1 and entryId2 in every match row for this category,
// including any auto-advanced bye slots and winner_entry_id references.
// Also swaps their seed values so draw ordering stays consistent.
// Blocked if either entry has any completed / in-progress / walkover match.
export async function swapDrawEntriesAction(
  categoryId: string,
  entryId1: string,
  entryId2: string,
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const cat = await assertCategoryManager(categoryId, user.id);
  if (!cat) return { error: 'Permission denied' };

  const admin = createAdminClient();

  // Refuse if any non-scheduled match references either entry
  const { data: blockers } = await admin
    .from('matches')
    .select('id')
    .eq('category_id', categoryId)
    .not('status', 'eq', 'scheduled')
    .or(
      `entry_a_id.eq.${entryId1},entry_a_id.eq.${entryId2},` +
      `entry_b_id.eq.${entryId1},entry_b_id.eq.${entryId2}`,
    )
    .limit(1);

  if (blockers && blockers.length > 0) {
    return { error: 'Cannot swap — one or both entries have already played a match.' };
  }

  // Fetch every match that references either entry (includes auto-advanced bye slots)
  const { data: affected } = await admin
    .from('matches')
    .select('id, entry_a_id, entry_b_id, winner_entry_id')
    .eq('category_id', categoryId)
    .or(
      `entry_a_id.eq.${entryId1},entry_a_id.eq.${entryId2},` +
      `entry_b_id.eq.${entryId1},entry_b_id.eq.${entryId2},` +
      `winner_entry_id.eq.${entryId1},winner_entry_id.eq.${entryId2}`,
    );

  if (!affected || affected.length === 0) {
    return { error: 'No draw matches found for these entries.' };
  }

  const swap = (id: string | null) =>
    id === entryId1 ? entryId2 : id === entryId2 ? entryId1 : id;

  await Promise.all(
    affected.map((m) =>
      admin.from('matches').update({
        entry_a_id:      swap(m.entry_a_id),
        entry_b_id:      swap(m.entry_b_id),
        winner_entry_id: swap(m.winner_entry_id ?? null),
      }).eq('id', m.id),
    ),
  );

  // Swap seed values on the entries themselves
  const { data: seeds } = await admin
    .from('tournament_entries')
    .select('id, seed')
    .in('id', [entryId1, entryId2]);

  if (seeds && seeds.length === 2) {
    const s1 = seeds.find((s) => s.id === entryId1);
    const s2 = seeds.find((s) => s.id === entryId2);
    if (s1 && s2) {
      await Promise.all([
        admin.from('tournament_entries').update({ seed: s2.seed ?? null }).eq('id', entryId1),
        admin.from('tournament_entries').update({ seed: s1.seed ?? null }).eq('id', entryId2),
      ]);
    }
  }

  const tSlug = (cat.tournaments as { slug: string } | null)?.slug ?? '';
  revalidatePath(`/tournaments/${tSlug}/categories/${cat.slug}`);
  return { success: true };
}

// ── Replace a withdrawn draw entry with a new active entry ───────────────────
// Swaps all unplayed match references from withdrawnEntryId to replacementEntryId.
// Completed / walkover / retired matches are left untouched.
export async function replaceDrawEntryAction(
  categoryId: string,
  withdrawnEntryId: string,   // entry currently referenced in matches (status = withdrawn)
  replacementEntryId: string, // active entry not yet in any match
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const cat = await assertCategoryManager(categoryId, user.id);
  if (!cat) return { error: 'Permission denied' };

  const admin = createAdminClient();

  // Verify the withdrawn entry appears in at least one match for this category
  const { data: withdrawnMatches } = await admin
    .from('matches')
    .select('id')
    .eq('category_id', categoryId)
    .or(`entry_a_id.eq.${withdrawnEntryId},entry_b_id.eq.${withdrawnEntryId}`)
    .limit(1);

  if (!withdrawnMatches || withdrawnMatches.length === 0) {
    return { error: 'The withdrawn entry is not in this draw.' };
  }

  // Verify the replacement entry is active in this category
  const { data: repEntry } = await admin
    .from('tournament_entries')
    .select('id, status')
    .eq('id', replacementEntryId)
    .eq('category_id', categoryId)
    .maybeSingle();

  if (!repEntry) return { error: 'Replacement entry not found in this category.' };
  if (repEntry.status !== 'active') return { error: 'Replacement entry is not active.' };

  // Verify the replacement entry is not already in a match
  const { data: alreadyPlaced } = await admin
    .from('matches')
    .select('id')
    .eq('category_id', categoryId)
    .or(`entry_a_id.eq.${replacementEntryId},entry_b_id.eq.${replacementEntryId}`)
    .limit(1);

  if (alreadyPlaced && alreadyPlaced.length > 0) {
    return { error: 'Replacement entry is already in the draw.' };
  }

  // Update entry_a_id references in unplayed matches
  await admin
    .from('matches')
    .update({ entry_a_id: replacementEntryId })
    .eq('category_id', categoryId)
    .eq('entry_a_id', withdrawnEntryId)
    .in('status', ['scheduled', 'in_progress', 'disputed']);

  // Update entry_b_id references in unplayed matches
  await admin
    .from('matches')
    .update({ entry_b_id: replacementEntryId })
    .eq('category_id', categoryId)
    .eq('entry_b_id', withdrawnEntryId)
    .in('status', ['scheduled', 'in_progress', 'disputed']);

  const tSlug = cat.tournamentData.slug;
  revalidatePath(`/tournaments/${tSlug}/categories/${cat.slug}`);
  return { success: true };
}

export async function getMatchesForCategory(categoryId: string): Promise<MatchWithPlayers[]> {
  const admin = createAdminClient();

  const { data } = await admin
    .from('matches')
    .select(
      `id, round, round_name, group_name, bracket_type, status, winner_entry_id, sets, court,
       ea:tournament_entries!entry_a_id(id, seed, status, players!player_id(full_name, username), partner:players!partner_id(full_name)),
       eb:tournament_entries!entry_b_id(id, seed, status, players!player_id(full_name, username), partner:players!partner_id(full_name))`,
    )
    .eq('category_id', categoryId)
    .order('round', { ascending: true })
    .order('bracket_position', { ascending: true });

  if (!data) return [];

  type EntryRaw = {
    id: string;
    seed: number | null;
    status: string;
    players: { full_name: string; username: string } | null;
    partner: { full_name: string } | null;
  } | null;

  return data.map((m) => {
    const ea = m.ea as EntryRaw;
    const eb = m.eb as EntryRaw;

    return {
      id: m.id,
      round: m.round,
      round_name: m.round_name,
      group_name: m.group_name,
      bracket_type: m.bracket_type,
      status: m.status,
      winner_entry_id: m.winner_entry_id,
      sets: m.sets,
      court: m.court,
      entry_a: ea
        ? {
            id: ea.id,
            seed: ea.seed,
            player_name: ea.players?.full_name ?? 'Unknown',
            partner_name: ea.partner?.full_name ?? null,
            player_username: ea.players?.username ?? '',
            entry_status: ea.status,
          }
        : null,
      entry_b: eb
        ? {
            id: eb.id,
            seed: eb.seed,
            player_name: eb.players?.full_name ?? 'Unknown',
            partner_name: eb.partner?.full_name ?? null,
            player_username: eb.players?.username ?? '',
            entry_status: eb.status,
          }
        : null,
    };
  });
}

// ── Shared: compute per-group standings with 6-level tiebreaker ───────────────
type GroupMatchRow = {
  id: string;
  round: number;
  group_name: string | null;
  status: string;
  entry_a_id: string | null;
  entry_b_id: string | null;
  winner_entry_id: string | null;
};

async function computeGroupStandings(categoryId: string): Promise<
  | { error: string }
  | {
      groupNames: string[];
      rankedByGroup: Map<string, string[]>;
      allGroupMatchesDone: boolean;
      groupMatches: GroupMatchRow[];
    }
> {
  const admin = createAdminClient();

  const { data: allMatches } = await admin
    .from('matches')
    .select('id, round, group_name, status, entry_a_id, entry_b_id, winner_entry_id')
    .eq('category_id', categoryId)
    .order('round', { ascending: true });

  if (!allMatches || allMatches.length === 0) return { error: 'No matches found' };

  const groupMatches = allMatches.filter((m) => m.group_name !== null) as GroupMatchRow[];
  if (groupMatches.length === 0) return { error: 'No group-stage matches found' };

  const pendingGroup = groupMatches.filter(
    (m) => m.status !== 'completed' && m.status !== 'walkover',
  );
  const allGroupMatchesDone = pendingGroup.length === 0;

  // Compute standings — fetch sets for point totals
  const { data: matchesWithSets } = await admin
    .from('matches')
    .select('id, group_name, entry_a_id, entry_b_id, winner_entry_id, sets')
    .eq('category_id', categoryId)
    .not('group_name', 'is', null);

  const groupNames = [...new Set(groupMatches.map((m) => m.group_name as string))].sort();

  const wins      = new Map<string, number>();
  const losses    = new Map<string, number>();
  const ptScored  = new Map<string, number>();
  const ptGiven   = new Map<string, number>();
  const pointDiff = new Map<string, number>();

  const initEntry = (id: string) => {
    if (!wins.has(id)) { wins.set(id, 0); losses.set(id, 0); ptScored.set(id, 0); ptGiven.set(id, 0); pointDiff.set(id, 0); }
  };

  for (const m of (matchesWithSets ?? [])) {
    if (!m.entry_a_id || !m.entry_b_id) continue;
    initEntry(m.entry_a_id);
    initEntry(m.entry_b_id);
    if (m.winner_entry_id) {
      wins.set(m.winner_entry_id, (wins.get(m.winner_entry_id) ?? 0) + 1);
      const loserId = m.winner_entry_id === m.entry_a_id ? m.entry_b_id : m.entry_a_id;
      losses.set(loserId, (losses.get(loserId) ?? 0) + 1);
    }
    if (Array.isArray(m.sets)) {
      let aTotal = 0, bTotal = 0;
      for (const s of m.sets as { score_a: number; score_b: number }[]) {
        aTotal += s.score_a ?? 0;
        bTotal += s.score_b ?? 0;
      }
      ptScored.set(m.entry_a_id, (ptScored.get(m.entry_a_id) ?? 0) + aTotal);
      ptGiven.set(m.entry_a_id,  (ptGiven.get(m.entry_a_id)  ?? 0) + bTotal);
      ptScored.set(m.entry_b_id, (ptScored.get(m.entry_b_id) ?? 0) + bTotal);
      ptGiven.set(m.entry_b_id,  (ptGiven.get(m.entry_b_id)  ?? 0) + aTotal);
      pointDiff.set(m.entry_a_id, (ptScored.get(m.entry_a_id) ?? 0) - (ptGiven.get(m.entry_a_id) ?? 0));
      pointDiff.set(m.entry_b_id, (ptScored.get(m.entry_b_id) ?? 0) - (ptGiven.get(m.entry_b_id) ?? 0));
    }
  }

  const entriesByGroup = new Map<string, Set<string>>();
  for (const m of groupMatches) {
    const g = m.group_name as string;
    if (!entriesByGroup.has(g)) entriesByGroup.set(g, new Set());
    if (m.entry_a_id) entriesByGroup.get(g)!.add(m.entry_a_id);
    if (m.entry_b_id) entriesByGroup.get(g)!.add(m.entry_b_id);
  }

  const gMatchMap = new Map<string, GroupMatchRow[]>();
  for (const m of groupMatches) {
    const g = m.group_name as string;
    if (!gMatchMap.has(g)) gMatchMap.set(g, []);
    gMatchMap.get(g)!.push(m);
  }

  const rankedByGroup = new Map<string, string[]>();
  for (const gName of groupNames) {
    const entryIds = [...(entriesByGroup.get(gName) ?? [])];
    const gMs = gMatchMap.get(gName) ?? [];
    const ranked = entryIds.sort((a, b) => {
      if ((wins.get(b) ?? 0) !== (wins.get(a) ?? 0)) return (wins.get(b) ?? 0) - (wins.get(a) ?? 0);
      if ((losses.get(a) ?? 0) !== (losses.get(b) ?? 0)) return (losses.get(a) ?? 0) - (losses.get(b) ?? 0);
      if ((pointDiff.get(b) ?? 0) !== (pointDiff.get(a) ?? 0)) return (pointDiff.get(b) ?? 0) - (pointDiff.get(a) ?? 0);
      if ((ptScored.get(b) ?? 0) !== (ptScored.get(a) ?? 0)) return (ptScored.get(b) ?? 0) - (ptScored.get(a) ?? 0);
      if ((ptGiven.get(a) ?? 0) !== (ptGiven.get(b) ?? 0)) return (ptGiven.get(a) ?? 0) - (ptGiven.get(b) ?? 0);
      const h2h = gMs.find((m) =>
        (m.entry_a_id === a && m.entry_b_id === b) ||
        (m.entry_a_id === b && m.entry_b_id === a),
      );
      if (h2h?.winner_entry_id === b) return 1;
      if (h2h?.winner_entry_id === a) return -1;
      return 0;
    });
    rankedByGroup.set(gName, ranked);
  }

  return { groupNames, rankedByGroup, allGroupMatchesDone, groupMatches };
}

// ── Promote group winners into knockout bracket ───────────────────────────────
// For group_stage_knockout format: after all group-stage matches finish, this
// action computes per-group standings and fills the knockout bracket entry slots
// in the order the draw engine laid them out (Group A 1st, Group A 2nd, …).
export async function promoteGroupWinnersAction(categoryId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const cat = await assertCategoryManager(categoryId, user.id);
  if (!cat) return { error: 'Permission denied' };

  if (cat.draw_format !== 'group_stage_knockout') {
    return { error: 'This action is only for group stage + knockout categories' };
  }

  if (cat.knockout_seeding === 'manual') {
    return { error: 'This category uses manual knockout seeding — use the Knockout Builder instead' };
  }

  const admin = createAdminClient();

  const standings = await computeGroupStandings(categoryId);
  if ('error' in standings) return { error: standings.error };
  const { groupNames, rankedByGroup, allGroupMatchesDone } = standings;

  if (!allGroupMatchesDone) {
    return { error: 'One or more group-stage matches still to be played' };
  }

  // Fetch knockout matches (null group_name)
  const { data: allMatches } = await admin
    .from('matches')
    .select('id, round, group_name, entry_a_id, entry_b_id')
    .eq('category_id', categoryId)
    .order('round', { ascending: true });
  if (!allMatches) return { error: 'No matches found' };
  const knockoutMatches = allMatches.filter((m) => m.group_name === null);

  // top_per_group_advance defaults to 2 — count knockout slots per group
  const totalKnockoutEntries = knockoutMatches.reduce((acc, m) => {
    if (m.entry_a_id) acc.add(m.entry_a_id);
    if (m.entry_b_id) acc.add(m.entry_b_id);
    return acc;
  }, new Set<string>()).size;
  const topPerGroup = groupNames.length > 0
    ? Math.round(totalKnockoutEntries / groupNames.length) || 2
    : 2;

  // Cross-group pairing — a team should never face another team from its own
  // group again in the knockout stage. Groups are paired up (A with B, C with
  // D, …) and within each group-pair, rank r from one group plays rank
  // (topPerGroup + 1 - r) from the other — symmetrically in both directions:
  // e.g. with top 2 advancing, A1 plays B2 AND A2 plays B1; with top 4
  // advancing, A1/B4, B1/A4, A2/B3, B2/A3.
  const n = groupNames.length;
  const ranked = groupNames.map((g) => rankedByGroup.get(g) ?? []);
  const advancingEntries: string[] = [];

  for (let i = 0; i + 1 < n; i += 2) {
    const gi = ranked[i];
    const gj = ranked[i + 1];

    for (let r = 1; r <= Math.floor(topPerGroup / 2); r++) {
      const rOpp = topPerGroup + 1 - r;
      const a1 = gi?.[r - 1];
      const b1 = gj?.[rOpp - 1];
      if (a1 && b1) advancingEntries.push(a1, b1);

      const b2 = gj?.[r - 1];
      const a2 = gi?.[rOpp - 1];
      if (b2 && a2) advancingEntries.push(b2, a2);
    }

    // Odd top-per-group count: the middle rank plays across the paired groups
    if (topPerGroup % 2 === 1) {
      const mid = (topPerGroup + 1) / 2;
      const a = gi?.[mid - 1];
      const b = gj?.[mid - 1];
      if (a && b) advancingEntries.push(a, b);
    }
  }

  if (advancingEntries.length === 0) return { error: 'No group results to promote' };

  // Find knockout matches with empty slots, ordered by round asc then bracket_position asc
  const emptyKnockout = knockoutMatches
    .filter((m) => !m.entry_a_id && !m.entry_b_id)
    .sort((a, b) => a.round - b.round);

  if (knockoutMatches.length === 0) {
    return { error: 'No knockout bracket found — use "Reset knockout bracket" first, then promote group winners' };
  }

  if (emptyKnockout.length === 0) {
    return { error: 'Knockout slots are already filled — use "Reset knockout bracket" if you want to re-promote' };
  }

  // Fill knockout slots pair by pair (each match gets entry_a and entry_b)
  const updates: PromiseLike<unknown>[] = [];
  let idx = 0;
  for (const m of emptyKnockout) {
    const entryA = advancingEntries[idx++] ?? null;
    const entryB = advancingEntries[idx++] ?? null;
    if (entryA || entryB) {
      updates.push(
        admin.from('matches').update({
          ...(entryA ? { entry_a_id: entryA } : {}),
          ...(entryB ? { entry_b_id: entryB } : {}),
        }).eq('id', m.id),
      );
    }
  }
  await Promise.all(updates);

  const tSlug = cat.tournamentData.slug;
  revalidatePath(`/tournaments/${tSlug}/categories/${cat.slug}`);
  revalidatePath(`/tournaments/${tSlug}/scoring`);
  return { success: true, promoted: advancingEntries.length };
}

// ── Reset knockout bracket (auto seeding) ──────────────────────────────────────
// Deletes any existing knockout-stage matches (group_name IS NULL) for this
// category — as long as none of them have started — and recreates empty
// knockout placeholder matches from scratch, ready for `promoteGroupWinnersAction`.
export async function resetKnockoutBracketAction(categoryId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const cat = await assertCategoryManager(categoryId, user.id);
  if (!cat) return { error: 'Permission denied' };

  if (cat.draw_format !== 'group_stage_knockout') {
    return { error: 'This action is only for group stage + knockout categories' };
  }
  if (cat.knockout_seeding === 'manual') {
    return { error: 'This category uses manual knockout seeding — use the Knockout Builder instead' };
  }

  const admin = createAdminClient();

  const { data: existingKnockout } = await admin
    .from('matches')
    .select('id, status, winner_entry_id')
    .eq('category_id', categoryId)
    .is('group_name', null);

  const started = (existingKnockout ?? []).some(
    (m) => m.status !== 'scheduled' || m.winner_entry_id,
  );
  if (started) {
    return { error: 'Cannot reset — one or more knockout matches have already started or been played' };
  }

  // Delete existing (unstarted) knockout matches
  if (existingKnockout && existingKnockout.length > 0) {
    await admin.from('matches').delete().eq('category_id', categoryId).is('group_name', null);
  }

  // Rebuild the knockout bracket structure (empty slots) from the draw engine
  const { data: entries, error: entryErr } = await admin
    .from('tournament_entries')
    .select('id, seed, players!player_id(id, full_name, username, global_stats(current_rating))')
    .eq('category_id', categoryId)
    .eq('status', 'active');
  if (entryErr || !entries) return { error: 'Failed to fetch entries' };

  const drawEntries: DrawEntry[] = entries.map((e) => {
    const player = e.players as {
      id: string;
      full_name: string;
      username: string;
      global_stats: { current_rating: number } | null;
    } | null;
    return {
      entry_id: e.id,
      player_ids: player ? [player.id] : [],
      display_name: player?.full_name ?? 'Unknown',
      seed: e.seed,
      rating: player?.global_stats?.current_rating ?? 3.5,
    };
  });

  const catAny = cat as typeof cat & {
    max_entries?: number | null;
    groups_count?: number | null;
    group_sizes?: number[] | null;
    advance_per_group?: number | null;
    has_third_place_match?: boolean | null;
    knockout_seeding?: 'auto' | 'manual' | null;
  };
  const groupsCount = catAny.groups_count ?? null;
  const groupSize = groupsCount && catAny.max_entries
    ? Math.ceil(catAny.max_entries / groupsCount)
    : 4;

  const config: DrawConfig = {
    format: cat.draw_format as DrawConfig['format'],
    entries: drawEntries,
    category_id: categoryId,
    group_size: groupSize,
    ...(catAny.group_sizes?.length && { group_sizes: catAny.group_sizes }),
    top_per_group_advance: catAny.advance_per_group ?? 2,
    has_third_place_match: catAny.has_third_place_match ?? false,
    knockout_seeding: 'auto',
  };

  let draw;
  try {
    draw = generateDraw(config);
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to rebuild knockout bracket' };
  }

  const knockoutRoundMatches = draw.rounds.flatMap((r) =>
    r.matches
      .filter((m) => m.group_name === null)
      .map((m, i) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ext = m as any;
        return {
          id: m.id,
          tournament_id: cat.tournamentData.id,
          category_id: categoryId,
          round: m.round,
          round_name: m.round_name,
          group_name: null,
          entry_a_id: m.entry_a?.entry_id ?? null,
          entry_b_id: m.entry_b?.entry_id ?? null,
          status: 'scheduled' as const,
          sets: [],
          bracket_position: i,
          bracket_type: ext._bracket_type ?? null,
          winner_to_match_id: ext._winner_to_match_id ?? null,
          loser_to_match_id: ext._loser_to_match_id ?? null,
          winner_slot: ext._winner_slot ?? null,
          loser_slot: ext._loser_slot ?? null,
        };
      }),
  );

  if (knockoutRoundMatches.length === 0) {
    return { error: 'Failed to rebuild knockout bracket — no knockout rounds found' };
  }

  const { error: insertErr } = await admin.from('matches').insert(knockoutRoundMatches);
  if (insertErr) return { error: `Failed to recreate knockout matches: ${insertErr.message}` };

  const tSlug = cat.tournamentData.slug;
  revalidatePath(`/tournaments/${tSlug}/categories/${cat.slug}`);
  return { success: true, matchCount: knockoutRoundMatches.length };
}

// ── Manual Knockout Builder ────────────────────────────────────────────────────
export interface KnockoutPoolEntry {
  entryId: string;
  displayName: string;
  label: string;
  /** Original group-stage group this entry came from — used to avoid pairing
   *  two entries that already played each other in the group stage. */
  groupName: string | null;
}

export interface KnockoutStandingRow {
  entryId: string;
  displayName: string;
  rank: number;
  played: number;
  wins: number;
  losses: number;
  pointsScored: number;
  pointsGiven: number;
  pointDiff: number;
}

/** Rank a set of entries by their results within a single set of matches,
 *  using the same 6-level tiebreaker as group standings (wins, losses,
 *  point diff, points scored, points given, head-to-head). */
function rankByStandings(
  entryIds: string[],
  matches: { entry_a_id: string | null; entry_b_id: string | null; winner_entry_id: string | null; sets: unknown }[],
  nameMap: Map<string, string>,
): KnockoutStandingRow[] {
  const wins = new Map<string, number>();
  const losses = new Map<string, number>();
  const ptScored = new Map<string, number>();
  const ptGiven = new Map<string, number>();
  for (const id of entryIds) { wins.set(id, 0); losses.set(id, 0); ptScored.set(id, 0); ptGiven.set(id, 0); }

  for (const m of matches) {
    if (!m.entry_a_id || !m.entry_b_id) continue;
    if (m.winner_entry_id) {
      wins.set(m.winner_entry_id, (wins.get(m.winner_entry_id) ?? 0) + 1);
      const loserId = m.winner_entry_id === m.entry_a_id ? m.entry_b_id : m.entry_a_id;
      losses.set(loserId, (losses.get(loserId) ?? 0) + 1);
    }
    if (Array.isArray(m.sets)) {
      let aTotal = 0, bTotal = 0;
      for (const s of m.sets as { score_a: number; score_b: number }[]) {
        aTotal += s.score_a ?? 0;
        bTotal += s.score_b ?? 0;
      }
      ptScored.set(m.entry_a_id, (ptScored.get(m.entry_a_id) ?? 0) + aTotal);
      ptGiven.set(m.entry_a_id, (ptGiven.get(m.entry_a_id) ?? 0) + bTotal);
      ptScored.set(m.entry_b_id, (ptScored.get(m.entry_b_id) ?? 0) + bTotal);
      ptGiven.set(m.entry_b_id, (ptGiven.get(m.entry_b_id) ?? 0) + aTotal);
    }
  }

  const played = (id: string) => (wins.get(id) ?? 0) + (losses.get(id) ?? 0);

  const ranked = [...entryIds].sort((a, b) => {
    if (played(b) !== played(a)) return played(b) - played(a);
    if ((wins.get(b) ?? 0) !== (wins.get(a) ?? 0)) return (wins.get(b) ?? 0) - (wins.get(a) ?? 0);
    if ((losses.get(a) ?? 0) !== (losses.get(b) ?? 0)) return (losses.get(a) ?? 0) - (losses.get(b) ?? 0);
    const diffA = (ptScored.get(a) ?? 0) - (ptGiven.get(a) ?? 0);
    const diffB = (ptScored.get(b) ?? 0) - (ptGiven.get(b) ?? 0);
    if (diffB !== diffA) return diffB - diffA;
    if ((ptScored.get(b) ?? 0) !== (ptScored.get(a) ?? 0)) return (ptScored.get(b) ?? 0) - (ptScored.get(a) ?? 0);
    if ((ptGiven.get(a) ?? 0) !== (ptGiven.get(b) ?? 0)) return (ptGiven.get(a) ?? 0) - (ptGiven.get(b) ?? 0);
    const h2h = matches.find((m) =>
      (m.entry_a_id === a && m.entry_b_id === b) || (m.entry_a_id === b && m.entry_b_id === a),
    );
    if (h2h?.winner_entry_id === b) return 1;
    if (h2h?.winner_entry_id === a) return -1;
    return 0;
  });

  return ranked.map((entryId, i) => ({
    entryId,
    displayName: nameMap.get(entryId) ?? 'Unknown',
    rank: i + 1,
    played: (wins.get(entryId) ?? 0) + (losses.get(entryId) ?? 0),
    wins: wins.get(entryId) ?? 0,
    losses: losses.get(entryId) ?? 0,
    pointsScored: ptScored.get(entryId) ?? 0,
    pointsGiven: ptGiven.get(entryId) ?? 0,
    pointDiff: (ptScored.get(entryId) ?? 0) - (ptGiven.get(entryId) ?? 0),
  }));
}

export interface KnockoutBuilderMatch {
  id: string;
  round: number;
  round_name: string;
  bracket_position: number;
  entry_a: { id: string; displayName: string } | null;
  entry_b: { id: string; displayName: string } | null;
  status: string;
  winner_entry_id: string | null;
}

export interface KnockoutBuilderState {
  groupStageComplete: boolean;
  topPerGroup: number;
  rounds: {
    round: number;
    roundName: string;
    matches: KnockoutBuilderMatch[];
    /** Set when at least one entry played more than one match in this round
     *  (i.e. it was a round-robin "stage" rather than a direct knockout round).
     *  Ranks the participants so the admin can build the next, single-match
     *  knockout round from these standings. */
    standings: KnockoutStandingRow[] | null;
  }[];
  /** Entries available to be paired up for the next round to build. Null if
   *  the knockout is already complete or the group stage isn't done yet. */
  currentPool: KnockoutPoolEntry[] | null;
  /** Suggested name for the round currently being built. */
  suggestedRoundName: string | null;
  champion: KnockoutPoolEntry | null;
  /** Pairs of entry IDs that already have a knockout match created (any round/status) — used to warn admins before creating a duplicate matchup. */
  existingPairs: [string, string][];
  /** Cumulative standings across all completed knockout matches so far (every
   *  stage), for entries currently in the pool — helps the admin pick the
   *  next set of matchups. Null if no knockout matches have been completed yet. */
  overallStandings: KnockoutStandingRow[] | null;
}

async function fetchEntryNames(admin: ReturnType<typeof createAdminClient>, entryIds: string[]): Promise<Map<string, string>> {
  const nameMap = new Map<string, string>();
  if (entryIds.length === 0) return nameMap;
  const { data } = await admin
    .from('tournament_entries')
    .select('id, players!player_id(full_name), partner:players!partner_id(full_name)')
    .in('id', entryIds);
  for (const e of (data ?? [])) {
    const player = e.players as { full_name: string } | null;
    const partner = e.partner as { full_name: string } | null;
    const name = player?.full_name ?? 'Unknown';
    nameMap.set(e.id, partner ? `${name} / ${partner.full_name}` : name);
  }
  return nameMap;
}

function suggestRoundName(poolSize: number): string {
  if (poolSize <= 2) return 'Final';
  if (poolSize <= 4) return 'Semi-final';
  if (poolSize <= 8) return 'Quarter-final';
  return `Round of ${poolSize}`;
}

export async function getKnockoutBuilderStateAction(categoryId: string): Promise<{ error: string } | { data: KnockoutBuilderState }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const cat = await assertCategoryManager(categoryId, user.id);
  if (!cat) return { error: 'Permission denied' };

  if (cat.draw_format !== 'group_stage_knockout') {
    return { error: 'This action is only for group stage + knockout categories' };
  }
  if (cat.knockout_seeding !== 'manual') {
    return { error: 'This category does not use manual knockout seeding' };
  }

  const admin = createAdminClient();

  const standings = await computeGroupStandings(categoryId);
  if ('error' in standings) return { error: standings.error };
  const { groupNames, rankedByGroup, allGroupMatchesDone } = standings;

  const topPerGroup = cat.advance_per_group ?? 2;

  // Existing knockout matches (group_name is null), with entry display info
  const { data: knockoutRows } = await admin
    .from('matches')
    .select('id, round, round_name, group_name, bracket_position, status, entry_a_id, entry_b_id, winner_entry_id, sets')
    .eq('category_id', categoryId)
    .is('group_name', null)
    .order('round', { ascending: true })
    .order('bracket_position', { ascending: true });

  const knockoutMatches = knockoutRows ?? [];

  // Collect all entry IDs we'll need names for: qualifiers + anything in knockout matches
  const allEntryIds = new Set<string>();
  for (const gName of groupNames) {
    for (const id of (rankedByGroup.get(gName) ?? []).slice(0, topPerGroup)) allEntryIds.add(id);
  }
  for (const m of knockoutMatches) {
    if (m.entry_a_id) allEntryIds.add(m.entry_a_id);
    if (m.entry_b_id) allEntryIds.add(m.entry_b_id);
  }
  const nameMap = await fetchEntryNames(admin, [...allEntryIds]);

  if (!allGroupMatchesDone) {
    return {
      data: {
        groupStageComplete: false,
        topPerGroup,
        rounds: [],
        currentPool: null,
        suggestedRoundName: null,
        champion: null,
        existingPairs: [],
        overallStandings: null,
      },
    };
  }

  // Build initial pool from group qualifiers — these entries (the real players)
  // are the entire universe that can ever appear in the knockout bracket.
  const entryInfo = new Map<string, { displayName: string; label: string; groupName: string | null }>();
  for (const gName of groupNames) {
    const ranked = (rankedByGroup.get(gName) ?? []).slice(0, topPerGroup);
    ranked.forEach((entryId, i) => {
      entryInfo.set(entryId, { displayName: nameMap.get(entryId) ?? 'Unknown', label: `Group ${gName.replace('Group ', '')} #${i + 1}`, groupName: gName });
    });
  }

  // Group existing knockout matches by round
  const roundsMap = new Map<number, typeof knockoutMatches>();
  for (const m of knockoutMatches) {
    if (!roundsMap.get(m.round)) roundsMap.set(m.round, []);
    roundsMap.get(m.round)!.push(m);
  }
  const sortedRounds = [...roundsMap.keys()].sort((a, b) => a - b);

  // Walk completed rounds in order, tracking the active pool and computing a
  // standings table for any round where an entry played more than one match
  // (a round-robin "stage" rather than a direct knockout round). For direct
  // knockout rounds (each entry plays at most one match), losers are
  // eliminated and winners advance with an updated "Winner – …" label.
  const standingsByRound = new Map<number, KnockoutStandingRow[]>();
  let pool: KnockoutPoolEntry[] = [...entryInfo.entries()]
    .map(([entryId, info]) => ({ entryId, displayName: info.displayName, label: info.label, groupName: info.groupName }));
  let champion: KnockoutPoolEntry | null = null;
  let finalWinnerId: string | null = null;
  let finalRunnerUpId: string | null = null;

  for (const round of sortedRounds) {
    const roundMatches = roundsMap.get(round)!;
    const allDone = roundMatches.every((m) => m.status === 'completed' || m.status === 'walkover');
    if (!allDone) break;

    const matchCount = new Map<string, number>();
    for (const m of roundMatches) {
      if (m.entry_a_id) matchCount.set(m.entry_a_id, (matchCount.get(m.entry_a_id) ?? 0) + 1);
      if (m.entry_b_id) matchCount.set(m.entry_b_id, (matchCount.get(m.entry_b_id) ?? 0) + 1);
    }
    const isMultiMatchStage = [...matchCount.values()].some((c) => c > 1);

    if (isMultiMatchStage) {
      const participantIds = [...matchCount.keys()];
      const standingRows = rankByStandings(participantIds, roundMatches, nameMap);
      standingsByRound.set(round, standingRows);
      const roundLabel = roundMatches[0]?.round_name ?? `Round ${round}`;
      const ranked = standingRows.map((r) => ({
        entryId: r.entryId,
        displayName: r.displayName,
        label: `${roundLabel} · #${r.rank} (${r.wins}W-${r.losses}L, ${r.pointDiff >= 0 ? '+' : ''}${r.pointDiff})`,
        groupName: entryInfo.get(r.entryId)?.groupName ?? null,
      }));
      const unaffected = pool.filter((p) => !matchCount.has(p.entryId));
      pool = [...ranked, ...unaffected];
    } else {
      // Keep both winners and losers in the pool — losers stay available so
      // the admin can still schedule them (e.g. a 3rd-place playoff, or to
      // correct a mistake) rather than disappearing once "eliminated".
      const labels = new Map<string, string>();
      const stageName = roundMatches[0]?.round_name ?? `Round ${round}`;
      for (const m of roundMatches) {
        if (!m.winner_entry_id) continue;
        const loserId = m.winner_entry_id === m.entry_a_id ? m.entry_b_id : m.entry_a_id;
        labels.set(m.winner_entry_id, `Winner – ${stageName}`);
        if (loserId) labels.set(loserId, `Lost – ${stageName}`);
      }
      pool = pool.map((p) => (labels.has(p.entryId) ? { ...p, label: labels.get(p.entryId)! } : p));

      // The winner of the "Final" is the champion — once that's decided, the
      // knockout is complete (other entries, e.g. for a 3rd-place playoff,
      // remain visible in the rounds above but no further round is built).
      const finalMatch = roundMatches.find((m) => (m.round_name ?? '') === 'Final' && m.winner_entry_id);
      if (finalMatch?.winner_entry_id) {
        champion = pool.find((p) => p.entryId === finalMatch.winner_entry_id) ?? null;
        finalWinnerId = finalMatch.winner_entry_id;
        finalRunnerUpId = finalMatch.winner_entry_id === finalMatch.entry_a_id ? finalMatch.entry_b_id : finalMatch.entry_a_id;
      }
    }
  }

  // Keep the pool (and the match-builder UI) available even after a champion
  // is determined — there may still be a 3rd-place playoff or other matches
  // the admin needs to create/correct.
  let currentPool: KnockoutPoolEntry[] | null = pool.length === 0 ? null : pool;

  // Duplicate-pairing checks only apply within the current stage (the round
  // currently being built) — teams may face each other again in a later
  // stage of the knockout.
  const maxRound = sortedRounds.length > 0 ? Math.max(...sortedRounds) : null;
  const maxRoundMatches = maxRound !== null ? roundsMap.get(maxRound)! : [];
  const maxRoundDone = maxRoundMatches.every((m) => m.status === 'completed' || m.status === 'walkover');
  const existingPairs: [string, string][] = (maxRound !== null && !maxRoundDone)
    ? maxRoundMatches
        .filter((m) => m.entry_a_id && m.entry_b_id)
        .map((m) => [m.entry_a_id as string, m.entry_b_id as string])
    : [];

  // Cumulative standings across every completed knockout match so far, for
  // entries currently in the pool — gives the admin an overview (including
  // matches played) to decide the next set of matchups.
  const completedKnockoutMatches = knockoutMatches.filter((m) => m.status === 'completed' || m.status === 'walkover');
  let overallStandings = completedKnockoutMatches.length > 0
    ? rankByStandings((currentPool ?? pool).map((p) => p.entryId), completedKnockoutMatches, nameMap)
    : null;

  // Once the Final is decided, its winner and runner-up must occupy the top
  // two standings positions regardless of other tiebreakers (e.g. matches
  // played) — this keeps the podium results consistent with the bracket.
  if (overallStandings && finalWinnerId) {
    const byId = new Map(overallStandings.map((r) => [r.entryId, r]));
    const winnerRow = byId.get(finalWinnerId);
    const runnerUpRow = finalRunnerUpId ? byId.get(finalRunnerUpId) : undefined;
    if (winnerRow) {
      const rest = overallStandings.filter((r) => r.entryId !== finalWinnerId && r.entryId !== runnerUpRow?.entryId);
      const ordered = [winnerRow, ...(runnerUpRow ? [runnerUpRow] : []), ...rest];
      overallStandings = ordered.map((r, i) => ({ ...r, rank: i + 1 }));
    }
  }

  const rounds = sortedRounds.map((round) => {
    const roundMatches = roundsMap.get(round)!;
    return {
      round,
      roundName: roundMatches[0]?.round_name ?? `Knockout Round ${round}`,
      matches: roundMatches.map((m) => ({
        id: m.id,
        round: m.round,
        round_name: m.round_name ?? '',
        bracket_position: m.bracket_position ?? 0,
        entry_a: m.entry_a_id ? { id: m.entry_a_id, displayName: nameMap.get(m.entry_a_id) ?? 'Unknown' } : null,
        entry_b: m.entry_b_id ? { id: m.entry_b_id, displayName: nameMap.get(m.entry_b_id) ?? 'Unknown' } : null,
        status: m.status,
        winner_entry_id: m.winner_entry_id,
      })),
      standings: standingsByRound.get(round) ?? null,
    };
  });

  return {
    data: {
      groupStageComplete: true,
      topPerGroup,
      rounds,
      currentPool,
      suggestedRoundName: currentPool ? suggestRoundName(currentPool.length) : null,
      champion,
      existingPairs,
      overallStandings,
    },
  };
}

// Compute the round number + bracket_position for the next manual knockout
// match, and the maximum group-stage round (knockout rounds start after it).
async function getNextKnockoutRoundInfo(admin: ReturnType<typeof createAdminClient>, categoryId: string) {
  const { data: rows } = await admin
    .from('matches')
    .select('round, group_name, bracket_position, status')
    .eq('category_id', categoryId);

  const groupRounds = (rows ?? []).filter((r) => r.group_name !== null).map((r) => r.round);
  const maxGroupRound = groupRounds.length > 0 ? Math.max(...groupRounds) : 0;

  const knockoutRows = (rows ?? []).filter((r) => r.group_name === null);
  if (knockoutRows.length === 0) {
    return { round: maxGroupRound + 1, bracketPosition: 0 };
  }
  const maxKnockoutRound = Math.max(...knockoutRows.map((r) => r.round));
  const lastRoundRows = knockoutRows.filter((r) => r.round === maxKnockoutRound);
  const lastRoundDone = lastRoundRows.every((r) => r.status === 'completed' || r.status === 'walkover');

  if (lastRoundDone) {
    return { round: maxKnockoutRound + 1, bracketPosition: 0 };
  }
  return { round: maxKnockoutRound, bracketPosition: lastRoundRows.length };
}

export async function createKnockoutMatchAction(
  categoryId: string,
  entryAId: string,
  entryBId: string,
  roundName?: string,
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const cat = await assertCategoryManager(categoryId, user.id);
  if (!cat) return { error: 'Permission denied' };

  if (cat.draw_format !== 'group_stage_knockout' || cat.knockout_seeding !== 'manual') {
    return { error: 'This action is only for manual knockout seeding categories' };
  }
  if (entryAId === entryBId) {
    return { error: 'Cannot pair an entry against itself' };
  }

  const admin = createAdminClient();

  // Verify both entries are currently in the available pool
  const stateResult = await getKnockoutBuilderStateAction(categoryId);
  if ('error' in stateResult) return stateResult;
  const pool = stateResult.data.currentPool;
  if (!pool) return { error: 'No round is currently ready to be built' };
  const poolIds = new Set(pool.map((p) => p.entryId));
  if (!poolIds.has(entryAId) || !poolIds.has(entryBId)) {
    return { error: 'Both entries must be in the current available pool' };
  }
  const alreadyPaired = stateResult.data.existingPairs.some(
    ([a, b]) => (a === entryAId && b === entryBId) || (a === entryBId && b === entryAId),
  );
  if (alreadyPaired) {
    return { error: 'A match between these two entries has already been scheduled in this knockout stage' };
  }

  const { round, bracketPosition } = await getNextKnockoutRoundInfo(admin, categoryId);
  const finalRoundName = roundName?.trim() || suggestRoundName(pool.length);

  const { error: insertErr } = await admin.from('matches').insert({
    id: crypto.randomUUID(),
    tournament_id: cat.tournament_id,
    category_id: categoryId,
    round,
    round_name: finalRoundName,
    group_name: null,
    bracket_type: 'winners',
    entry_a_id: entryAId,
    entry_b_id: entryBId,
    status: 'scheduled',
    sets: [],
    bracket_position: bracketPosition,
  });
  if (insertErr) return { error: `Failed to create match: ${insertErr.message}` };

  const tSlug = cat.tournamentData.slug;
  revalidatePath(`/tournaments/${tSlug}/categories/${cat.slug}`);
  revalidatePath(`/tournaments/${tSlug}/categories/${cat.slug}/knockout-builder`);
  return { success: true };
}

export async function deleteKnockoutMatchAction(categoryId: string, matchId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const cat = await assertCategoryManager(categoryId, user.id);
  if (!cat) return { error: 'Permission denied' };

  const admin = createAdminClient();

  const { data: match } = await admin
    .from('matches')
    .select('id, category_id, group_name, status')
    .eq('id', matchId)
    .single();

  if (!match || match.category_id !== categoryId || match.group_name !== null) {
    return { error: 'Match not found' };
  }
  if (match.status !== 'scheduled') {
    return { error: 'Cannot remove a match that has already started' };
  }

  await admin.from('matches').delete().eq('id', matchId);

  const tSlug = cat.tournamentData.slug;
  revalidatePath(`/tournaments/${tSlug}/categories/${cat.slug}`);
  revalidatePath(`/tournaments/${tSlug}/categories/${cat.slug}/knockout-builder`);
  return { success: true };
}

// ── Reset knockout bracket (manual seeding) ─────────────────────────────────
// Deletes all manually-created knockout matches (group_name IS NULL) for this
// category — as long as none of them have started — so the admin can rebuild
// the bracket from scratch via the Knockout Builder.
export async function resetManualKnockoutAction(categoryId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const cat = await assertCategoryManager(categoryId, user.id);
  if (!cat) return { error: 'Permission denied' };

  if (cat.draw_format !== 'group_stage_knockout' || cat.knockout_seeding !== 'manual') {
    return { error: 'This action is only for categories using manual knockout seeding' };
  }

  const admin = createAdminClient();

  const { data: existingKnockout } = await admin
    .from('matches')
    .select('id, status, winner_entry_id')
    .eq('category_id', categoryId)
    .is('group_name', null);

  if (!existingKnockout || existingKnockout.length === 0) {
    return { error: 'No knockout matches to reset' };
  }

  const started = existingKnockout.some((m) => m.status !== 'scheduled' || m.winner_entry_id);
  if (started) {
    return { error: 'Cannot reset — one or more knockout matches have already started or been played' };
  }

  await admin.from('matches').delete().eq('category_id', categoryId).is('group_name', null);

  const tSlug = cat.tournamentData.slug;
  revalidatePath(`/tournaments/${tSlug}/categories/${cat.slug}`);
  revalidatePath(`/tournaments/${tSlug}/categories/${cat.slug}/knockout-builder`);
  return { success: true };
}
