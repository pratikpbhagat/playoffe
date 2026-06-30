'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient, createClient, getCurrentUser } from '@/lib/supabase/server';
import { checkPermission } from '@/lib/permissions';
import { calculateRatingChange } from '@pickleball/rating';
import { createNotificationsForPlayers } from './notifications';
import { sendMatchResultNotification } from '@/lib/email/notifications';
import { awardBadgesForPlayer } from './badges';
import { enqueueMatchWinGraphic, enqueueCategoryCompleteGraphic } from '@/lib/social-queue';

interface SetScore {
  set_number: number;
  score_a: number;
  score_b: number;
}

type MatchRow = {
  id: string;
  category_id: string;
  tournament_id: string | null;
  round: number;
  bracket_position: number | null;
  bracket_type: string | null;
  entry_a_id: string | null;
  entry_b_id: string | null;
  winner_entry_id: string | null;
  status: string;
  winner_to_match_id: string | null;
  loser_to_match_id: string | null;
  winner_slot: string | null;
  loser_slot: string | null;
  tie_id: string | null;
};

// ── Tie completion + advancement (team_event) ────────────────────────────────
// Called after every rubber match completes. The tie_rubber_complete DB trigger
// has already recomputed the tie's aggregates (rubbers_won_a/b, points_for_a,
// points_against_a, point_diff_a) synchronously in the same UPDATE that marked
// the rubber 'completed'. This function owns the business-logic decision the
// trigger no longer makes: is the tie actually decided yet, does it need a
// decider rubber, and — once decided — does the winning team advance.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function checkAndAdvanceTie(admin: any, tieId: string) {
  const { data: tie } = await admin
    .from('ties')
    .select('id, category_id, round, group_name, bracket_position, status, winner_team_id, winner_to_tie_id, winner_slot, team_a_id, team_b_id, rubbers_won_a, rubbers_won_b, point_diff_a')
    .eq('id', tieId)
    .single();

  if (!tie) return;

  if (tie.status !== 'completed') {
    const decided = await decideTieOutcome(admin, tie);
    if (!decided) return; // not ready yet (rubbers still in progress, or awaiting a decider)
  }

  const { data: freshTie } = await admin
    .from('ties')
    .select('status, winner_team_id, winner_to_tie_id, winner_slot, bracket_position, category_id, round')
    .eq('id', tieId)
    .single();

  if (!freshTie || freshTie.status !== 'completed' || !freshTie.winner_team_id) return;

  if (freshTie.winner_to_tie_id && freshTie.winner_slot) {
    const slot = freshTie.winner_slot === 'a' ? 'team_a_id' : 'team_b_id';
    await admin.from('ties').update({ [slot]: freshTie.winner_team_id }).eq('id', freshTie.winner_to_tie_id);
    return;
  }

  if (freshTie.bracket_position !== null) {
    const nextPos = Math.floor(freshTie.bracket_position / 2);
    const slot = freshTie.bracket_position % 2 === 0 ? 'team_a_id' : 'team_b_id';
    const { data: nextTie } = await admin
      .from('ties')
      .select('id')
      .eq('category_id', freshTie.category_id)
      .eq('round', freshTie.round + 1)
      .eq('bracket_position', nextPos)
      .maybeSingle();
    if (nextTie) {
      await admin.from('ties').update({ [slot]: freshTie.winner_team_id }).eq('id', nextTie.id);
    }
  }
}

// ── Decide whether a tie is actually finished, and how ───────────────────────
// Returns true once the tie has been marked 'completed' (winner decided, or a
// genuine draw in group stage). Returns false if still waiting on rubbers or
// a decider. Knockout ties tied on rubbers get a decider rubber created here
// (if the category configured one) and flip to 'awaiting_decider'.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function decideTieOutcome(admin: any, tie: any): Promise<boolean> {
  const { data: cat } = await admin
    .from('tournament_categories')
    .select('rubber_lineup, decider_format, tournament_id')
    .eq('id', tie.category_id)
    .single();

  const totalMain = ((cat?.rubber_lineup ?? []) as unknown[]).length;

  const { count: completedMain } = await admin
    .from('matches')
    .select('id', { count: 'exact', head: true })
    .eq('tie_id', tie.id)
    .eq('is_decider', false)
    .in('status', ['completed', 'walkover']);

  if ((completedMain ?? 0) < totalMain) return false;

  const isKnockout = tie.group_name === null;

  if (tie.rubbers_won_a !== tie.rubbers_won_b) {
    const winner = tie.rubbers_won_a > tie.rubbers_won_b ? tie.team_a_id : tie.team_b_id;
    await admin.from('ties').update({ status: 'completed', completed_at: new Date().toISOString(), winner_team_id: winner }).eq('id', tie.id);
    return true;
  }

  if (!isKnockout) {
    // Group stage: a genuine draw is allowed — no decider, standings tiebreak handles ranking.
    await admin.from('ties').update({ status: 'completed', completed_at: new Date().toISOString(), winner_team_id: null }).eq('id', tie.id);
    return true;
  }

  // Knockout, tied on rubbers — needs a decider.
  const { data: existingDecider } = await admin
    .from('matches')
    .select('id, status, winner_entry_id')
    .eq('tie_id', tie.id)
    .eq('is_decider', true)
    .maybeSingle();

  if (existingDecider) {
    if (existingDecider.status !== 'completed' && existingDecider.status !== 'walkover') return false; // still waiting
    const { data: winnerEntry } = await admin
      .from('tournament_entries')
      .select('team_id')
      .eq('id', existingDecider.winner_entry_id)
      .maybeSingle();
    const winner = winnerEntry?.team_id ?? (tie.point_diff_a >= 0 ? tie.team_a_id : tie.team_b_id);
    await admin.from('ties').update({ status: 'completed', completed_at: new Date().toISOString(), winner_team_id: winner }).eq('id', tie.id);
    return true;
  }

  if (!cat?.decider_format) {
    // No decider configured for this category — fall back to point differential.
    const winner = tie.point_diff_a >= 0 ? tie.team_a_id : tie.team_b_id;
    await admin.from('ties').update({ status: 'completed', completed_at: new Date().toISOString(), winner_team_id: winner }).eq('id', tie.id);
    return true;
  }

  await admin.from('matches').insert({
    tournament_id: cat.tournament_id,
    category_id: tie.category_id,
    round: tie.round,
    tie_id: tie.id,
    rubber_sequence: totalMain + 1,
    is_decider: true,
    status: 'scheduled',
    sets: [],
  });
  await admin.from('ties').update({ status: 'awaiting_decider' }).eq('id', tie.id);

  const { data: teams } = await admin
    .from('tournament_teams')
    .select('captain_id')
    .in('id', [tie.team_a_id, tie.team_b_id]);
  const captainIds = (teams ?? []).map((t: { captain_id: string }) => t.captain_id);
  if (captainIds.length > 0) {
    await createNotificationsForPlayers(
      captainIds,
      'tie_decider_needed',
      'Decider rubber needed',
      'Your tie is tied after the scheduled rubbers — submit your player(s) for the decider.',
    );
  }

  return false;
}

// ── Bracket advancement helper ────────────────────────────────────────────────
// Works for both single-elimination (positional) and double-elimination (explicit links).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function advanceMatch(admin: any, match: MatchRow, winnerEntryId: string | null, loserEntryId: string | null) {
  // Winner advancement
  if (winnerEntryId) {
    if (match.winner_to_match_id && match.winner_slot) {
      const slot = match.winner_slot === 'a' ? 'entry_a_id' : 'entry_b_id';
      await admin.from('matches').update({ [slot]: winnerEntryId }).eq('id', match.winner_to_match_id);
    } else if (match.bracket_position !== null) {
      // Fallback: positional advancement for SE
      const nextPos = Math.floor(match.bracket_position / 2);
      const slot = match.bracket_position % 2 === 0 ? 'entry_a_id' : 'entry_b_id';
      const { data: nextMatch } = await admin
        .from('matches')
        .select('id')
        .eq('category_id', match.category_id)
        .eq('round', match.round + 1)
        .eq('bracket_position', nextPos)
        .maybeSingle();
      if (nextMatch) {
        await admin.from('matches').update({ [slot]: winnerEntryId }).eq('id', nextMatch.id);
      }
    }
  }

  // Loser advancement (DE only — sends loser to losers bracket)
  if (loserEntryId && match.loser_to_match_id && match.loser_slot) {
    const slot = match.loser_slot === 'a' ? 'entry_a_id' : 'entry_b_id';
    await admin.from('matches').update({ [slot]: loserEntryId }).eq('id', match.loser_to_match_id);
  }

  // team_event: this match is a rubber within a tie — check if the tie is now
  // decided and advance the winning team to the next round's tie.
  if (match.tie_id) {
    await checkAndAdvanceTie(admin, match.tie_id);
  }
}

// ── Auth guard ────────────────────────────────────────────────────────────────
async function assertMatchManager(matchId: string, userId: string) {
  const admin = createAdminClient();
  const { data: match } = await admin
    .from('matches')
    .select('id, category_id, tournament_id, round, bracket_position, bracket_type, status, entry_a_id, entry_b_id, winner_entry_id, sets, scheduled_time, winner_to_match_id, loser_to_match_id, winner_slot, loser_slot, tie_id')
    .eq('id', matchId)
    .single();
  if (!match) return null;

  const { data: t } = await admin
    .from('tournaments')
    .select('club_id, slug, name')
    .eq('id', match.tournament_id)
    .single();
  if (!t) return null;

  const { data: mgr } = await admin
    .from('club_managers')
    .select('role')
    .eq('club_id', t.club_id)
    .eq('player_id', userId)
    .maybeSingle();

  return mgr ? { match, clubId: t.club_id, tournamentSlug: t.slug, tournamentName: t.name } : null;
}

// ── Assign court / referee to a scheduled match (without starting it) ─────────
// Also clears paused_for_reassignment so a live match returns to normal Live Now.
export async function assignMatchDetailsAction(
  matchId: string,
  court: number | null,
  refereeName: string | null,
) {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return { error: 'Not authenticated' };

  const ctx = await assertMatchManager(matchId, user.id);
  if (!ctx) return { error: 'Permission denied' };

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patch: Record<string, any> = {
    // Always clear the paused flag when admin saves an assignment
    paused_for_reassignment: false,
    // Stamp assignment time so the referee page can order by when admin assigned
    assigned_at: new Date().toISOString(),
  };
  if (court !== null) patch.court = court;
  if (refereeName !== null) patch.assigned_referee_name = refereeName || null;

  const { error } = await admin.from('matches').update(patch).eq('id', matchId);
  if (error) return { error: 'Failed to update match' };

  revalidatePath(`/tournaments/${ctx.tournamentSlug}/scoring`);
  return { success: true };
}

// ── Assign court/referee to every rubber in a team-event tie at once ─────────
// A tie's rubbers always play on the same court back-to-back, so rather than
// assigning each one individually, the organiser can set it once for the
// whole tie. Only rubbers still 'scheduled' are touched — any rubber that's
// already live or completed keeps its own assignment untouched.
export async function assignTieDetailsAction(
  tieId: string,
  court: number | null,
  refereeName: string | null,
) {
  const user = await getCurrentUser();
  if (!user) return { error: 'Not authenticated' };

  const admin = createAdminClient();

  const { data: tie } = await admin.from('ties').select('id, tournament_id').eq('id', tieId).single();
  if (!tie) return { error: 'Tie not found' };

  const { data: t } = await admin.from('tournaments').select('club_id, slug').eq('id', tie.tournament_id).single();
  if (!t) return { error: 'Tournament not found' };

  const { data: mgr } = await admin
    .from('club_managers')
    .select('role')
    .eq('club_id', t.club_id)
    .eq('player_id', user.id)
    .maybeSingle();
  if (!mgr) return { error: 'Permission denied' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patch: Record<string, any> = {
    paused_for_reassignment: false,
    assigned_at: new Date().toISOString(),
  };
  if (court !== null) patch.court = court;
  if (refereeName !== null) patch.assigned_referee_name = refereeName || null;

  const { error } = await admin
    .from('matches')
    .update(patch)
    .eq('tie_id', tieId)
    .eq('status', 'scheduled');
  if (error) return { error: 'Failed to update tie' };

  revalidatePath(`/tournaments/${t.slug}/scoring`);
  return { success: true };
}

// ── Pause a live match so the admin can re-assign court / referee ──────────────
// Admin-initiated version (uses user session auth).
export async function pauseMatchForReassignmentAction(matchId: string) {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return { error: 'Not authenticated' };

  const ctx = await assertMatchManager(matchId, user.id);
  if (!ctx) return { error: 'Permission denied' };

  if (ctx.match.status !== 'in_progress') {
    return { error: 'Match is not in progress' };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('matches')
    .update({ paused_for_reassignment: true })
    .eq('id', matchId);

  if (error) return { error: 'Failed to pause match' };

  revalidatePath(`/tournaments/${ctx.tournamentSlug}/scoring`);
  revalidatePath(`/tournaments/${ctx.tournamentSlug}/scoring/${matchId}`);
  return { success: true };
}

// ── Start a match ─────────────────────────────────────────────────────────────
export async function startMatchAction(
  matchId: string,
  court: number,
  refereeName?: string,
  servingEntryId?: string | null,
  /** For traditional scoring, pass 2 (first server starts at 2 per pickleball rules).
   *  For rally scoring, pass null. */
  serverNumber?: 1 | 2 | null,
) {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return { error: 'Not authenticated' };

  const ctx = await assertMatchManager(matchId, user.id);
  if (!ctx) return { error: 'Permission denied' };

  if (ctx.match.status !== 'scheduled') {
    return { error: 'Match is not in scheduled state' };
  }

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patch: Record<string, any> = {
    status: 'in_progress',
    started_at: new Date().toISOString(),
    court,
  };
  if (refereeName) patch.assigned_referee_name = refereeName;
  if (servingEntryId) patch.serving_entry_id = servingEntryId;
  if (serverNumber !== undefined) patch.server_number = serverNumber;

  const { error } = await admin.from('matches').update(patch).eq('id', matchId);
  if (error) return { error: 'Failed to start match' };

  revalidatePath(`/tournaments/${ctx.tournamentSlug}/scoring`);
  revalidatePath(`/tournaments/${ctx.tournamentSlug}/scoring/${matchId}`);
  return { success: true };
}

// ── Intermediate auto-save (no status change) ────────────────────────────────
// Called on debounce as the admin enters scores. Persists sets (and current
// serving team) to DB so the display screen receives the Realtime event.
export async function saveScoreAction(
  matchId: string,
  sets: SetScore[],
  servingEntryId?: string | null,
  serverNumber?: number | null,
) {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return { error: 'Not authenticated' };

  const ctx = await assertMatchManager(matchId, user.id);
  if (!ctx) return { error: 'Permission denied' };

  if (ctx.match.status !== 'in_progress') return { error: 'Match is not in progress' };

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patch: Record<string, any> = {
    sets: sets.map((s, i) => ({ set_number: i + 1, score_a: s.score_a, score_b: s.score_b })),
  };
  // Always persist serving state so the display screen stays in sync
  if (servingEntryId !== undefined) patch.serving_entry_id = servingEntryId;
  if (serverNumber !== undefined) patch.server_number = serverNumber;

  const { error } = await admin.from('matches').update(patch).eq('id', matchId);

  if (error) return { error: 'Failed to save score' };
  return { success: true };
}

// ── Submit final result ───────────────────────────────────────────────────────
export async function submitResultAction(
  matchId: string,
  sets: SetScore[],
  winnerEntryId: string,
) {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return { error: 'Not authenticated' };

  const ctx = await assertMatchManager(matchId, user.id);
  if (!ctx) return { error: 'Permission denied' };

  const { match, clubId } = ctx;
  if (!match.entry_a_id || !match.entry_b_id) {
    return { error: 'Match has missing entries' };
  }
  if (winnerEntryId !== match.entry_a_id && winnerEntryId !== match.entry_b_id) {
    return { error: 'Winner must be one of the two entries' };
  }

  const loserEntryId = winnerEntryId === match.entry_a_id ? match.entry_b_id : match.entry_a_id;
  const admin = createAdminClient();

  // ── Resolve player IDs and current ratings ────────────────────────────────
  const [{ data: entryA }, { data: entryB }] = await Promise.all([
    admin.from('tournament_entries').select('player_id').eq('id', match.entry_a_id).single(),
    admin.from('tournament_entries').select('player_id').eq('id', match.entry_b_id).single(),
  ]);
  if (!entryA || !entryB) return { error: 'Could not load entry player data' };

  const [{ data: statsA }, { data: statsB }] = await Promise.all([
    admin.from('global_stats').select('current_rating, peak_rating, singles_matches, doubles_matches, mixed_doubles_matches, singles_wins, doubles_wins, mixed_doubles_wins').eq('player_id', entryA.player_id).single(),
    admin.from('global_stats').select('current_rating, peak_rating, singles_matches, doubles_matches, mixed_doubles_matches, singles_wins, doubles_wins, mixed_doubles_wins').eq('player_id', entryB.player_id).single(),
  ]);

  // ── Fetch play format for rating weight ──────────────────────────────────
  const { data: category } = await admin
    .from('tournament_categories')
    .select('play_format')
    .eq('id', match.category_id)
    .single();
  const isDoubles = category?.play_format === 'doubles' || category?.play_format === 'mixed_doubles';
  const playFormat = (category?.play_format ?? 'singles') as 'singles' | 'doubles' | 'mixed_doubles';

  // ── Calculate scores for rating ──────────────────────────────────────────
  const aWins = winnerEntryId === match.entry_a_id;
  const totalScoreA = sets.reduce((s, set) => s + set.score_a, 0);
  const totalScoreB = sets.reduce((s, set) => s + set.score_b, 0);

  const ratingA = statsA?.current_rating ?? 3.5;
  const ratingB = statsB?.current_rating ?? 3.5;

  const resultA = calculateRatingChange({
    playerRating: ratingA,
    opponentRating: ratingB,
    playerScore: totalScoreA,
    opponentScore: totalScoreB,
    isWin: aWins,
    playedAt: new Date(),
    isDoubles,
  });

  const resultB = calculateRatingChange({
    playerRating: ratingB,
    opponentRating: ratingA,
    playerScore: totalScoreB,
    opponentScore: totalScoreA,
    isWin: !aWins,
    playedAt: new Date(),
    isDoubles,
  });

  // ── Complete the match (DB trigger inserts match_history + updates win counts) ──
  const { error: matchErr } = await admin
    .from('matches')
    .update({
      status: 'completed',
      winner_entry_id: winnerEntryId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sets: sets as any,
      completed_at: new Date().toISOString(),
    })
    .eq('id', matchId);

  if (matchErr) return { error: 'Failed to save match result' };

  // ── Update global_stats ratings ──────────────────────────────────────────
  const formatMatchKey = playFormat === 'singles' ? 'singles_matches' :
    playFormat === 'doubles' ? 'doubles_matches' : 'mixed_doubles_matches';
  const formatWinKey = playFormat === 'singles' ? 'singles_wins' :
    playFormat === 'doubles' ? 'doubles_wins' : 'mixed_doubles_wins';

  await Promise.all([
    admin.from('global_stats').update({
      current_rating: resultA.newRating,
      peak_rating: Math.max(resultA.newRating, statsA?.peak_rating ?? resultA.newRating),
      [formatMatchKey]: ((statsA?.[formatMatchKey] ?? 0) as number) + 1,
      [formatWinKey]: ((statsA?.[formatWinKey] ?? 0) as number) + (aWins ? 1 : 0),
      updated_at: new Date().toISOString(),
    }).eq('player_id', entryA.player_id),
    admin.from('global_stats').update({
      current_rating: resultB.newRating,
      peak_rating: Math.max(resultB.newRating, statsB?.peak_rating ?? resultB.newRating),
      [formatMatchKey]: ((statsB?.[formatMatchKey] ?? 0) as number) + 1,
      [formatWinKey]: ((statsB?.[formatWinKey] ?? 0) as number) + (!aWins ? 1 : 0),
      updated_at: new Date().toISOString(),
    }).eq('player_id', entryB.player_id),
  ]);

  // ── Fix rating fields in match_history (trigger inserts with old rating) ──
  await Promise.all([
    admin.from('match_history')
      .update({ rating_after: resultA.newRating, rating_change: resultA.change })
      .eq('match_id', matchId)
      .eq('player_id', entryA.player_id),
    admin.from('match_history')
      .update({ rating_after: resultB.newRating, rating_change: resultB.change })
      .eq('match_id', matchId)
      .eq('player_id', entryB.player_id),
  ]);

  // ── Bracket advancement ──────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await advanceMatch(admin, match as any, winnerEntryId, loserEntryId);

  const { data: catSlugRow } = await admin
    .from('tournament_categories')
    .select('slug, name')
    .eq('id', match.category_id)
    .maybeSingle();

  // ── In-app notifications to both players ────────────────────────────────
  const scoreStr = sets.map((s) => `${s.score_a}-${s.score_b}`).join(', ');
  const drawLink = catSlugRow?.slug
    ? `/events/${ctx.tournamentSlug}/draw/${catSlugRow.slug}`
    : null;
  void createNotificationsForPlayers(
    [entryA.player_id, entryB.player_id],
    'match_result',
    'Match result recorded',
    `${catSlugRow?.name ?? 'Match'}: ${scoreStr}`,
    drawLink ?? undefined,
  );

  // ── Match result emails to both players ──────────────────────────────────
  const [{ data: playerA }, { data: playerB }] = await Promise.all([
    admin.from('players').select('email, full_name').eq('id', entryA.player_id).single(),
    admin.from('players').select('email, full_name').eq('id', entryB.player_id).single(),
  ]);

  if (playerA?.email) {
    void sendMatchResultNotification({
      playerEmail: playerA.email,
      playerName: playerA.full_name,
      opponentName: playerB?.full_name ?? 'Opponent',
      isWin: aWins,
      isWalkover: false,
      score: scoreStr,
      ratingChange: resultA.change,
      newRating: resultA.newRating,
      tournamentName: ctx.tournamentName,
      categoryName: catSlugRow?.name ?? '',
      tournamentSlug: ctx.tournamentSlug,
      matchId,
    });
  }
  if (playerB?.email) {
    void sendMatchResultNotification({
      playerEmail: playerB.email,
      playerName: playerB.full_name,
      opponentName: playerA?.full_name ?? 'Opponent',
      isWin: !aWins,
      isWalkover: false,
      score: scoreStr,
      ratingChange: resultB.change,
      newRating: resultB.newRating,
      tournamentName: ctx.tournamentName,
      categoryName: catSlugRow?.name ?? '',
      tournamentSlug: ctx.tournamentSlug,
      matchId,
    });
  }

  // Award any newly-earned badges to both players (fire-and-forget)
  void awardBadgesForPlayer(entryA.player_id);
  void awardBadgesForPlayer(entryB.player_id);

  // ── Enqueue social posting job for the winner (fire-and-forget) ───────────
  // Non-critical: errors are swallowed inside enqueueMatchWinGraphic so they
  // never block the scoring action response.
  const winnerPlayerId = aWins ? entryA.player_id : entryB.player_id;
  void enqueueMatchWinGraphic({
    winnerPlayerId,
    winnerEntryId: winnerEntryId,
    matchId,
    categoryId: match.category_id,
    tournamentId: match.tournament_id,
  });

  // ── Check if the category is now fully complete ───────────────────────────
  // If no scheduled / in-progress matches remain, fire category_complete for
  // both players (fire-and-forget; each player's prefs control if they post).
  const { count: remainingMatches } = await admin
    .from('matches')
    .select('id', { count: 'exact', head: true })
    .eq('category_id', match.category_id)
    .not('status', 'in', '(completed,walkover,retired)');

  if (remainingMatches === 0) {
    void enqueueCategoryCompleteGraphic({
      playerId:     entryA.player_id,
      entryId:      match.entry_a_id!,
      categoryId:   match.category_id,
      tournamentId: match.tournament_id,
    });
    void enqueueCategoryCompleteGraphic({
      playerId:     entryB.player_id,
      entryId:      match.entry_b_id!,
      categoryId:   match.category_id,
      tournamentId: match.tournament_id,
    });
  }

  revalidatePath(`/tournaments/${ctx.tournamentSlug}/scoring/${matchId}`);
  revalidatePath(`/tournaments/${ctx.tournamentSlug}/categories/${catSlugRow?.slug ?? match.category_id}`);
  return { success: true, ratingChangeA: resultA.change, ratingChangeB: resultB.change };
}

// ── Walkover ──────────────────────────────────────────────────────────────────
export async function walkoverAction(matchId: string, winnerEntryId: string) {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return { error: 'Not authenticated' };

  const ctx = await assertMatchManager(matchId, user.id);
  if (!ctx) return { error: 'Permission denied' };

  const { match } = ctx;
  const admin = createAdminClient();

  const { error } = await admin
    .from('matches')
    .update({
      status: 'walkover',
      winner_entry_id: winnerEntryId,
      completed_at: new Date().toISOString(),
    })
    .eq('id', matchId);

  if (error) return { error: 'Failed to record walkover' };

  // Bracket advancement
  const loserEntryId = winnerEntryId === match.entry_a_id ? match.entry_b_id : match.entry_a_id;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await advanceMatch(admin, match as any, winnerEntryId, loserEntryId);

  const { data: catSlugRow2 } = await admin
    .from('tournament_categories')
    .select('slug, name')
    .eq('id', match.category_id)
    .maybeSingle();

  // ── Walkover emails ───────────────────────────────────────────────────────
  if (match.entry_a_id && match.entry_b_id) {
    const [{ data: entryWA }, { data: entryLA }] = await Promise.all([
      admin.from('tournament_entries').select('player_id').eq('id', winnerEntryId).single(),
      admin.from('tournament_entries').select('player_id').eq('id', loserEntryId ?? '').maybeSingle(),
    ]);
    const winnerPId = entryWA?.player_id;
    const loserPId = entryLA?.player_id;

    if (winnerPId && loserPId) {
      const [{ data: winPl }, { data: losPl }] = await Promise.all([
        admin.from('players').select('email, full_name').eq('id', winnerPId).single(),
        admin.from('players').select('email, full_name').eq('id', loserPId).single(),
      ]);
      const commonOpts = {
        isWalkover: true, score: '', ratingChange: 0, newRating: 0,
        tournamentName: ctx.tournamentName, categoryName: catSlugRow2?.name ?? '',
        tournamentSlug: ctx.tournamentSlug, matchId,
      };
      if (winPl?.email) void sendMatchResultNotification({ ...commonOpts, playerEmail: winPl.email, playerName: winPl.full_name, opponentName: losPl?.full_name ?? 'Opponent', isWin: true });
      if (losPl?.email) void sendMatchResultNotification({ ...commonOpts, playerEmail: losPl.email, playerName: losPl.full_name, opponentName: winPl?.full_name ?? 'Opponent', isWin: false });
    }
  }

  revalidatePath(`/tournaments/${ctx.tournamentSlug}/scoring/${matchId}`);
  revalidatePath(`/tournaments/${ctx.tournamentSlug}/categories/${catSlugRow2?.slug ?? match.category_id}`);
  return { success: true };
}

// ── Mid-tournament withdrawal: walkover all pending matches for an entry ───────
// Organiser-only. Marks the entry as withdrawn and grants walkovers to every
// opponent the withdrawn player/pair was yet to face.
export async function withdrawAndWalkoverAction(entryId: string, tournamentId: string) {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return { error: 'Not authenticated' };

  const admin = createAdminClient();

  // Auth: caller must be a club manager for this tournament
  const { data: t } = await admin
    .from('tournaments')
    .select('club_id, slug')
    .eq('id', tournamentId)
    .single();
  if (!t) return { error: 'Tournament not found' };

  const { data: mgr } = await admin
    .from('club_managers')
    .select('role')
    .eq('club_id', t.club_id)
    .eq('player_id', user.id)
    .maybeSingle();
  if (!mgr) return { error: 'Permission denied' };

  // Check role_permissions: is the 'admin' role allowed to withdraw entries?
  const allowed = await checkPermission('admin', 'entries', 'withdraw', t.club_id);
  if (!allowed) return { error: 'Withdrawals are not permitted at this time.' };

  const { data: entry } = await admin
    .from('tournament_entries')
    .select('id, status, category_id')
    .eq('id', entryId)
    .eq('tournament_id', tournamentId)
    .single();
  if (!entry) return { error: 'Entry not found' };
  if (entry.status === 'withdrawn') return { error: 'Entry is already withdrawn' };

  // Find every scheduled/in-progress match that involves this entry
  const { data: pending } = await admin
    .from('matches')
    .select('id, round, bracket_position, bracket_type, category_id, tournament_id, entry_a_id, entry_b_id, winner_entry_id, winner_to_match_id, loser_to_match_id, winner_slot, loser_slot, status')
    .eq('tournament_id', tournamentId)
    .in('status', ['scheduled', 'in_progress'])
    .or(`entry_a_id.eq.${entryId},entry_b_id.eq.${entryId}`);

  const now = new Date().toISOString();
  const matchList = pending ?? [];

  // Batch the status updates first, then parallelize bracket advancement.
  await Promise.all(
    matchList.map((m) => {
      const opponentId = m.entry_a_id === entryId ? m.entry_b_id : m.entry_a_id;
      return admin.from('matches').update({
        status: 'walkover',
        winner_entry_id: opponentId ?? null,
        completed_at: now,
      }).eq('id', m.id);
    }),
  );

  const walkovers = (
    await Promise.all(
      matchList.map(async (m) => {
        const opponentId = m.entry_a_id === entryId ? m.entry_b_id : m.entry_a_id;
        if (!opponentId) return 0;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await advanceMatch(admin, m as any, opponentId, entryId);
        return 1;
      }),
    )
  ).reduce((a: number, b) => a + b, 0);

  await admin.from('tournament_entries').update({ status: 'withdrawn' }).eq('id', entryId);

  const { data: catSlug } = await admin
    .from('tournament_categories').select('slug').eq('id', entry.category_id).maybeSingle();

  revalidatePath(`/tournaments/${t.slug}/registrations`);
  revalidatePath(`/tournaments/${t.slug}/scoring`);
  revalidatePath(`/tournaments/${t.slug}/categories/${catSlug?.slug ?? entry.category_id}`);
  return { success: true, walkovers };
}

// ── Override / correct a completed match result ───────────────────────────────
// Organiser override: undo old bracket advancement + rating changes, then apply
// the corrected result.  Blocked if any downstream match has already started.
export async function overrideMatchResultAction(
  matchId: string,
  newWinnerEntryId: string,
  newSets: SetScore[],
) {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return { error: 'Not authenticated' };

  const ctx = await assertMatchManager(matchId, user.id);
  if (!ctx) return { error: 'Permission denied' };

  const { match, clubId } = ctx;

  if (match.status !== 'completed' && match.status !== 'walkover') {
    return { error: 'Can only override completed or walkover matches' };
  }
  if (!match.entry_a_id || !match.entry_b_id) {
    return { error: 'Match has missing entries — cannot override' };
  }
  if (newWinnerEntryId !== match.entry_a_id && newWinnerEntryId !== match.entry_b_id) {
    return { error: 'Winner must be one of the two entries' };
  }

  const admin = createAdminClient();

  // ── Guard: downstream matches must not have started ───────────────────────
  async function guardNextMatch(nextId: string | null): Promise<string | null> {
    if (!nextId) return null;
    const { data: nm } = await admin.from('matches').select('status').eq('id', nextId).single();
    if (nm && nm.status !== 'scheduled' && nm.status !== 'walkover') {
      return 'Cannot override — a subsequent match has already been played. Contact the tournament director to manually correct the bracket.';
    }
    return null;
  }

  const err1 = await guardNextMatch(match.winner_to_match_id);
  if (err1) return { error: err1 };
  const err2 = await guardNextMatch(match.loser_to_match_id);
  if (err2) return { error: err2 };

  // SE positional check (no explicit link)
  if (!match.winner_to_match_id && match.bracket_position !== null) {
    const nextPos = Math.floor(match.bracket_position / 2);
    const { data: seNext } = await admin
      .from('matches')
      .select('status')
      .eq('category_id', match.category_id)
      .eq('round', match.round + 1)
      .eq('bracket_position', nextPos)
      .maybeSingle();
    if (seNext && seNext.status !== 'scheduled') {
      return { error: 'Cannot override — the next match has already been played.' };
    }
  }

  // ── Resolve player IDs ────────────────────────────────────────────────────
  const [{ data: entryA }, { data: entryB }] = await Promise.all([
    admin.from('tournament_entries').select('player_id').eq('id', match.entry_a_id).single(),
    admin.from('tournament_entries').select('player_id').eq('id', match.entry_b_id).single(),
  ]);
  if (!entryA || !entryB) return { error: 'Could not load entry player data' };

  // ── Load old match_history (for rating_before baseline) ──────────────────
  type MH = { rating_before: number; result: string } | null;
  const [mhARes, mhBRes] = await Promise.all([
    admin.from('match_history').select('rating_before, result')
      .eq('match_id', matchId).eq('player_id', entryA.player_id).maybeSingle(),
    admin.from('match_history').select('rating_before, result')
      .eq('match_id', matchId).eq('player_id', entryB.player_id).maybeSingle(),
  ]);
  const mhA = mhARes.data as MH;
  const mhB = mhBRes.data as MH;

  // ── Load current global stats ─────────────────────────────────────────────
  const { data: category } = await admin
    .from('tournament_categories').select('play_format, slug').eq('id', match.category_id).single();
  const playFormat = (category?.play_format ?? 'singles') as 'singles' | 'doubles' | 'mixed_doubles';
  const isDoubles = playFormat === 'doubles' || playFormat === 'mixed_doubles';
  const fmtMatch = playFormat === 'singles' ? 'singles_matches' : playFormat === 'doubles' ? 'doubles_matches' : 'mixed_doubles_matches';
  const fmtWin   = playFormat === 'singles' ? 'singles_wins'   : playFormat === 'doubles' ? 'doubles_wins'   : 'mixed_doubles_wins';

  const statsCols = 'current_rating, peak_rating, total_matches, wins, losses, singles_matches, doubles_matches, mixed_doubles_matches, singles_wins, doubles_wins, mixed_doubles_wins';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [{ data: statsA }, { data: statsB }]: [{ data: any }, { data: any }] = await Promise.all([
    admin.from('global_stats').select(statsCols).eq('player_id', entryA.player_id).single(),
    admin.from('global_stats').select(statsCols).eq('player_id', entryB.player_id).single(),
  ]);

  // ── Undo bracket advancement (null out old winner/loser slots) ────────────
  if (match.winner_to_match_id && match.winner_slot) {
    const slot = match.winner_slot === 'a' ? 'entry_a_id' : 'entry_b_id';
    await admin.from('matches').update({ [slot]: null }).eq('id', match.winner_to_match_id);
  } else if (match.bracket_position !== null) {
    const nextPos = Math.floor(match.bracket_position / 2);
    const slot    = match.bracket_position % 2 === 0 ? 'entry_a_id' : 'entry_b_id';
    const { data: seNext } = await admin.from('matches').select('id')
      .eq('category_id', match.category_id).eq('round', match.round + 1).eq('bracket_position', nextPos).maybeSingle();
    if (seNext) await admin.from('matches').update({ [slot]: null }).eq('id', seNext.id);
  }
  if (match.loser_to_match_id && match.loser_slot) {
    const slot = match.loser_slot === 'a' ? 'entry_a_id' : 'entry_b_id';
    await admin.from('matches').update({ [slot]: null }).eq('id', match.loser_to_match_id);
  }

  // ── Calculate new ratings (using pre-match ratings as baseline) ───────────
  const newAWins    = newWinnerEntryId === match.entry_a_id;
  const newLoserEntryId = newAWins ? match.entry_b_id : match.entry_a_id;

  // Use rating_before from match_history if available; else current rating
  const ratingA = mhA?.rating_before ?? statsA?.current_rating ?? 3.5;
  const ratingB = mhB?.rating_before ?? statsB?.current_rating ?? 3.5;

  const totalScoreA = newSets.reduce((s, set) => s + set.score_a, 0);
  const totalScoreB = newSets.reduce((s, set) => s + set.score_b, 0);

  const resultA = calculateRatingChange({ playerRating: ratingA, opponentRating: ratingB, playerScore: totalScoreA, opponentScore: totalScoreB, isWin: newAWins,  playedAt: new Date(), isDoubles });
  const resultB = calculateRatingChange({ playerRating: ratingB, opponentRating: ratingA, playerScore: totalScoreB, opponentScore: totalScoreA, isWin: !newAWins, playedAt: new Date(), isDoubles });

  // ── Update the match row ──────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: matchErr } = await admin.from('matches').update({
    winner_entry_id: newWinnerEntryId,
    sets: newSets as any,
    status: 'completed',
    completed_at: new Date().toISOString(),
  }).eq('id', matchId);
  if (matchErr) return { error: 'Failed to save override' };

  // ── Patch global_stats in a single update per player ─────────────────────
  // Net delta: remove old result, apply new result (total_matches unchanged).
  if (statsA) {
    const oldWinA = mhA?.result === 'win';
    await admin.from('global_stats').update({
      current_rating: resultA.newRating,
      peak_rating: Math.max(resultA.newRating, statsA.peak_rating ?? resultA.newRating),
      wins:   Math.max(0, (statsA.wins   ?? 0) - (oldWinA ? 1 : 0) + (newAWins  ? 1 : 0)),
      losses: Math.max(0, (statsA.losses ?? 0) - (oldWinA ? 0 : 1) + (newAWins  ? 0 : 1)),
      win_rate: statsA.total_matches > 0
        ? Math.max(0, (statsA.wins ?? 0) - (oldWinA ? 1 : 0) + (newAWins ? 1 : 0)) / statsA.total_matches
        : 0,
      [fmtWin]: Math.max(0, (statsA[fmtWin] ?? 0) - (oldWinA ? 1 : 0) + (newAWins ? 1 : 0)),
      updated_at: new Date().toISOString(),
    }).eq('player_id', entryA.player_id);
  }
  if (statsB) {
    const oldWinB = mhB?.result === 'win';
    const newBWins = !newAWins;
    await admin.from('global_stats').update({
      current_rating: resultB.newRating,
      peak_rating: Math.max(resultB.newRating, statsB.peak_rating ?? resultB.newRating),
      wins:   Math.max(0, (statsB.wins   ?? 0) - (oldWinB ? 1 : 0) + (newBWins ? 1 : 0)),
      losses: Math.max(0, (statsB.losses ?? 0) - (oldWinB ? 0 : 1) + (newBWins ? 0 : 1)),
      win_rate: statsB.total_matches > 0
        ? Math.max(0, (statsB.wins ?? 0) - (oldWinB ? 1 : 0) + (newBWins ? 1 : 0)) / statsB.total_matches
        : 0,
      [fmtWin]: Math.max(0, (statsB[fmtWin] ?? 0) - (oldWinB ? 1 : 0) + (newBWins ? 1 : 0)),
      updated_at: new Date().toISOString(),
    }).eq('player_id', entryB.player_id);
  }

  // ── Replace match_history records ─────────────────────────────────────────
  await admin.from('match_history').delete().eq('match_id', matchId);
  const tournamentId = match.tournament_id ?? '';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin.from('match_history') as any).insert({
      player_id: entryA.player_id, match_id: matchId, tournament_id: tournamentId, club_id: clubId,
      result: newAWins ? 'win' : 'loss',
      sets: newSets, opponent_entry_id: match.entry_b_id,
      rating_before: ratingA, rating_after: resultA.newRating, rating_change: resultA.change,
      played_at: new Date().toISOString(),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin.from('match_history') as any).insert({
      player_id: entryB.player_id, match_id: matchId, tournament_id: tournamentId, club_id: clubId,
      result: !newAWins ? 'win' : 'loss',
      sets: newSets, opponent_entry_id: match.entry_a_id,
      rating_before: ratingB, rating_after: resultB.newRating, rating_change: resultB.change,
      played_at: new Date().toISOString(),
    }),
  ]);

  // ── Re-advance bracket with new winner/loser ──────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await advanceMatch(admin, match as any, newWinnerEntryId, newLoserEntryId);

  revalidatePath(`/tournaments/${ctx.tournamentSlug}/scoring/${matchId}`);
  revalidatePath(`/tournaments/${ctx.tournamentSlug}/categories/${category?.slug ?? match.category_id}`);
  return { success: true };
}

// ── Approve a referee's restart request ───────────────────────────────────────
// Resets the match to 'scheduled', clears court/referee so it re-enters the
// upcoming queue. Bracket slot is NOT reversed here — that happens when the
// new result is submitted.
export async function approveMatchRestartAction(matchId: string) {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return { error: 'Not authenticated' };

  const ctx = await assertMatchManager(matchId, user.id);
  if (!ctx) return { error: 'Permission denied' };

  if (ctx.match.status !== 'completed' && ctx.match.status !== 'walkover') {
    return { error: 'Can only restart a completed or walkover match' };
  }

  const admin = createAdminClient();

  const { error } = await admin.from('matches').update({
    status: 'scheduled',
    winner_entry_id: null,
    sets: [],
    completed_at: null,
    started_at: null,
    court: null,
    assigned_referee_name: null,
    paused_for_reassignment: false,
    restart_requested: false,
    restart_requested_reason: null,
    submitted_by_name: null,
    submitted_via: null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any).eq('id', matchId);

  if (error) return { error: 'Failed to approve restart: ' + error.message };

  revalidatePath(`/tournaments/${ctx.tournamentSlug}/scoring`);
  return { success: true };
}

// ── Approve a player self-report ──────────────────────────────────────────────
// Reads player_reported_winner_id / player_reported_sets, runs rating + bracket
// logic, then marks the match completed.  Organiser-only.
export async function approvePlayerReportAction(matchId: string) {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return { error: 'Not authenticated' };

  const ctx = await assertMatchManager(matchId, user.id);
  if (!ctx) return { error: 'Permission denied' };

  const { match } = ctx;
  if (match.status === 'completed' || match.status === 'walkover') {
    return { error: 'Match is already completed' };
  }
  if (!match.entry_a_id || !match.entry_b_id) {
    return { error: 'Match has missing entries' };
  }

  // Fetch the player-reported data (not in assertMatchManager select)
  const admin = createAdminClient();
  const { data: reportRow } = await admin
    .from('matches')
    .select('player_reported_winner_id, player_reported_sets')
    .eq('id', matchId)
    .single();

  const reportedWinnerId = reportRow?.player_reported_winner_id as string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reportedSets = ((reportRow?.player_reported_sets ?? []) as any[]) as SetScore[];

  if (!reportedWinnerId) return { error: 'No player-reported score to approve' };
  if (reportedSets.length === 0) return { error: 'Player report contains no set scores' };
  if (reportedWinnerId !== match.entry_a_id && reportedWinnerId !== match.entry_b_id) {
    return { error: 'Reported winner is not a valid entry for this match' };
  }

  const loserEntryId = reportedWinnerId === match.entry_a_id ? match.entry_b_id : match.entry_a_id;

  // ── Resolve player IDs and current ratings ────────────────────────────────
  const [{ data: entryA }, { data: entryB }] = await Promise.all([
    admin.from('tournament_entries').select('player_id').eq('id', match.entry_a_id).single(),
    admin.from('tournament_entries').select('player_id').eq('id', match.entry_b_id).single(),
  ]);
  if (!entryA || !entryB) return { error: 'Could not load entry player data' };

  const [{ data: statsA }, { data: statsB }] = await Promise.all([
    admin.from('global_stats').select('current_rating, peak_rating, singles_matches, doubles_matches, mixed_doubles_matches, singles_wins, doubles_wins, mixed_doubles_wins').eq('player_id', entryA.player_id).single(),
    admin.from('global_stats').select('current_rating, peak_rating, singles_matches, doubles_matches, mixed_doubles_matches, singles_wins, doubles_wins, mixed_doubles_wins').eq('player_id', entryB.player_id).single(),
  ]);

  // ── Fetch play format ─────────────────────────────────────────────────────
  const { data: category } = await admin
    .from('tournament_categories')
    .select('play_format, slug')
    .eq('id', match.category_id)
    .single();
  const isDoubles = category?.play_format === 'doubles' || category?.play_format === 'mixed_doubles';
  const playFormat = (category?.play_format ?? 'singles') as 'singles' | 'doubles' | 'mixed_doubles';

  // ── Calculate ratings ─────────────────────────────────────────────────────
  const aWins = reportedWinnerId === match.entry_a_id;
  const totalScoreA = reportedSets.reduce((s, set) => s + set.score_a, 0);
  const totalScoreB = reportedSets.reduce((s, set) => s + set.score_b, 0);
  const ratingA = statsA?.current_rating ?? 3.5;
  const ratingB = statsB?.current_rating ?? 3.5;

  const resultA = calculateRatingChange({
    playerRating: ratingA, opponentRating: ratingB,
    playerScore: totalScoreA, opponentScore: totalScoreB,
    isWin: aWins, playedAt: new Date(), isDoubles,
  });
  const resultB = calculateRatingChange({
    playerRating: ratingB, opponentRating: ratingA,
    playerScore: totalScoreB, opponentScore: totalScoreA,
    isWin: !aWins, playedAt: new Date(), isDoubles,
  });

  // ── Complete the match ────────────────────────────────────────────────────
  const { error: matchErr } = await admin.from('matches').update({
    status: 'completed',
    winner_entry_id: reportedWinnerId,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sets: reportedSets as any,
    completed_at: new Date().toISOString(),
  }).eq('id', matchId);
  if (matchErr) return { error: 'Failed to save approved result' };

  // ── Update global_stats ───────────────────────────────────────────────────
  const formatMatchKey = playFormat === 'singles' ? 'singles_matches'
    : playFormat === 'doubles' ? 'doubles_matches' : 'mixed_doubles_matches';
  const formatWinKey = playFormat === 'singles' ? 'singles_wins'
    : playFormat === 'doubles' ? 'doubles_wins' : 'mixed_doubles_wins';

  await Promise.all([
    admin.from('global_stats').update({
      current_rating: resultA.newRating,
      peak_rating: Math.max(resultA.newRating, statsA?.peak_rating ?? resultA.newRating),
      [formatMatchKey]: ((statsA?.[formatMatchKey] ?? 0) as number) + 1,
      [formatWinKey]:   ((statsA?.[formatWinKey]   ?? 0) as number) + (aWins ? 1 : 0),
      updated_at: new Date().toISOString(),
    }).eq('player_id', entryA.player_id),
    admin.from('global_stats').update({
      current_rating: resultB.newRating,
      peak_rating: Math.max(resultB.newRating, statsB?.peak_rating ?? resultB.newRating),
      [formatMatchKey]: ((statsB?.[formatMatchKey] ?? 0) as number) + 1,
      [formatWinKey]:   ((statsB?.[formatWinKey]   ?? 0) as number) + (!aWins ? 1 : 0),
      updated_at: new Date().toISOString(),
    }).eq('player_id', entryB.player_id),
  ]);

  // ── Fix rating fields in match_history ───────────────────────────────────
  await Promise.all([
    admin.from('match_history').update({ rating_after: resultA.newRating, rating_change: resultA.change })
      .eq('match_id', matchId).eq('player_id', entryA.player_id),
    admin.from('match_history').update({ rating_after: resultB.newRating, rating_change: resultB.change })
      .eq('match_id', matchId).eq('player_id', entryB.player_id),
  ]);

  // ── Bracket advancement ───────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await advanceMatch(admin, match as any, reportedWinnerId, loserEntryId);

  revalidatePath(`/tournaments/${ctx.tournamentSlug}/scoring/${matchId}`);
  revalidatePath(`/tournaments/${ctx.tournamentSlug}/scoring`);
  revalidatePath(`/tournaments/${ctx.tournamentSlug}`);
  revalidatePath(`/tournaments/${ctx.tournamentSlug}/categories/${category?.slug ?? match.category_id}`);
  return { success: true, ratingChangeA: resultA.change, ratingChangeB: resultB.change };
}

// ── Reject a player self-report ───────────────────────────────────────────────
// Clears player_reported_winner_id + player_reported_sets so the match
// returns to its prior unscored state.  Organiser-only.
export async function rejectPlayerReportAction(matchId: string) {
  'use server';
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return { error: 'Not authenticated' };

  const ctx = await assertMatchManager(matchId, user.id);
  if (!ctx) return { error: 'Permission denied' };

  const { match } = ctx;
  if (match.status === 'completed' || match.status === 'walkover') {
    return { error: 'Match is already completed' };
  }

  const admin = createAdminClient();
  const { error: updateErr } = await admin
    .from('matches')
    .update({
      player_reported_winner_id: null,
      player_reported_sets: null,
    })
    .eq('id', matchId);

  if (updateErr) return { error: 'Failed to reject report' };

  revalidatePath(`/tournaments/${ctx.tournamentSlug}/scoring/${matchId}`);
  revalidatePath(`/tournaments/${ctx.tournamentSlug}/scoring`);
  revalidatePath(`/tournaments/${ctx.tournamentSlug}`);
  return { success: true };
}
