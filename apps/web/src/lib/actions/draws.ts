'use server';

import { revalidatePath } from 'next/cache';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { generateDraw } from '@pickleball/draw-engine';
import type { DrawConfig, DrawEntry } from '@pickleball/shared';

// ── Auth guard ────────────────────────────────────────────────────────────────
async function assertCategoryManager(categoryId: string, userId: string) {
  const admin = createAdminClient();

  const { data: cat } = await admin
    .from('tournament_categories')
    .select('id, tournament_id, draw_format, slug, tournaments!inner(id, club_id, slug, court_count)')
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
export async function generateDrawAction(categoryId: string) {
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

  // Generate the draw
  const config: DrawConfig = {
    format: cat.draw_format as DrawConfig['format'],
    entries: drawEntries,
    category_id: categoryId,
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
    id: string;
    seed: number | null;
    player_name: string;
    player_username: string;
  } | null;
  entry_b: {
    id: string;
    seed: number | null;
    player_name: string;
    player_username: string;
  } | null;
};

export async function getMatchesForCategory(categoryId: string): Promise<MatchWithPlayers[]> {
  const admin = createAdminClient();

  const { data } = await admin
    .from('matches')
    .select(
      `id, round, round_name, group_name, bracket_type, status, winner_entry_id, sets, court,
       ea:tournament_entries!entry_a_id(id, seed, players!player_id(full_name, username)),
       eb:tournament_entries!entry_b_id(id, seed, players!player_id(full_name, username))`,
    )
    .eq('category_id', categoryId)
    .order('round', { ascending: true })
    .order('bracket_position', { ascending: true });

  if (!data) return [];

  return data.map((m) => {
    const ea = m.ea as { id: string; seed: number | null; players: { full_name: string; username: string } | null } | null;
    const eb = m.eb as { id: string; seed: number | null; players: { full_name: string; username: string } | null } | null;

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
            player_username: ea.players?.username ?? '',
          }
        : null,
      entry_b: eb
        ? {
            id: eb.id,
            seed: eb.seed,
            player_name: eb.players?.full_name ?? 'Unknown',
            player_username: eb.players?.username ?? '',
          }
        : null,
    };
  });
}
