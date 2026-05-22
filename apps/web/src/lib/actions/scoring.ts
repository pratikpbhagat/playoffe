'use server';

import { revalidatePath } from 'next/cache';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { calculateRatingChange } from '@pickleball/rating';

interface SetScore {
  set_number: number;
  score_a: number;
  score_b: number;
}

// ── Auth guard ────────────────────────────────────────────────────────────────
async function assertMatchManager(matchId: string, userId: string) {
  const admin = createAdminClient();
  const { data: match } = await admin
    .from('matches')
    .select('id, category_id, tournament_id, round, bracket_position, status, entry_a_id, entry_b_id, winner_entry_id, sets')
    .eq('id', matchId)
    .single();
  if (!match) return null;

  const { data: t } = await admin
    .from('tournaments')
    .select('club_id, slug')
    .eq('id', match.tournament_id)
    .single();
  if (!t) return null;

  const { data: mgr } = await admin
    .from('club_managers')
    .select('role')
    .eq('club_id', t.club_id)
    .eq('player_id', userId)
    .maybeSingle();

  return mgr ? { match, clubId: t.club_id, tournamentSlug: t.slug } : null;
}

// ── Start a match ─────────────────────────────────────────────────────────────
export async function startMatchAction(matchId: string, court: number) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const ctx = await assertMatchManager(matchId, user.id);
  if (!ctx) return { error: 'Permission denied' };

  if (ctx.match.status !== 'scheduled') {
    return { error: 'Match is not in scheduled state' };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('matches')
    .update({ status: 'in_progress', started_at: new Date().toISOString(), court })
    .eq('id', matchId);

  if (error) return { error: 'Failed to start match' };

  revalidatePath(`/tournaments/${ctx.tournamentSlug}/scoring/${matchId}`);
  return { success: true };
}

// ── Submit final result ───────────────────────────────────────────────────────
export async function submitResultAction(
  matchId: string,
  sets: SetScore[],
  winnerEntryId: string,
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
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

  // ── Bracket advancement (elimination only) ───────────────────────────────
  if (match.bracket_position !== null && match.bracket_position !== undefined) {
    const nextPos = Math.floor((match.bracket_position as number) / 2);
    const slot = (match.bracket_position as number) % 2 === 0 ? 'entry_a_id' : 'entry_b_id';
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

  const { data: catSlugRow } = await admin
    .from('tournament_categories')
    .select('slug')
    .eq('id', match.category_id)
    .maybeSingle();
  revalidatePath(`/tournaments/${ctx.tournamentSlug}/scoring/${matchId}`);
  revalidatePath(`/tournaments/${ctx.tournamentSlug}/categories/${catSlugRow?.slug ?? match.category_id}`);
  return { success: true, ratingChangeA: resultA.change, ratingChangeB: resultB.change };
}

// ── Walkover ──────────────────────────────────────────────────────────────────
export async function walkoverAction(matchId: string, winnerEntryId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
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
  if (match.bracket_position !== null && match.bracket_position !== undefined) {
    const nextPos = Math.floor((match.bracket_position as number) / 2);
    const slot = (match.bracket_position as number) % 2 === 0 ? 'entry_a_id' : 'entry_b_id';
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

  const { data: catSlugRow2 } = await admin
    .from('tournament_categories')
    .select('slug')
    .eq('id', match.category_id)
    .maybeSingle();
  revalidatePath(`/tournaments/${ctx.tournamentSlug}/scoring/${matchId}`);
  revalidatePath(`/tournaments/${ctx.tournamentSlug}/categories/${catSlugRow2?.slug ?? match.category_id}`);
  return { success: true };
}
