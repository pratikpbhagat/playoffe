'use server';

import { createAdminClient } from '@/lib/supabase/server';

/**
 * Check and award any newly-earned badges for a player.
 * Uses upsert so it is always safe to call multiple times.
 */
export async function awardBadgesForPlayer(playerId: string): Promise<void> {
  const admin = createAdminClient();

  // ── Global stats ──────────────────────────────────────────────────────────
  const { data: stats } = await admin
    .from('global_stats')
    .select('wins, losses, current_rating, peak_rating')
    .eq('player_id', playerId)
    .maybeSingle();

  const wins = stats?.wins ?? 0;
  const losses = stats?.losses ?? 0;
  const totalMatches = wins + losses;
  const peakRating = stats?.peak_rating ?? 3.5;

  // ── Recent match results for streak check ─────────────────────────────────
  const { data: history } = await admin
    .from('match_history')
    .select('result')
    .eq('player_id', playerId)
    .order('played_at', { ascending: false })
    .limit(3);

  const recent = (history ?? []).map((h) => h.result);
  const hatTrick = recent.length === 3 && recent.every((r) => r === 'win');

  // ── Tournament champion check ──────────────────────────────────────────────
  // A player is a champion if one of their entries won the highest round in a category
  const isTournamentChampion = await (async () => {
    const { data: entries } = await admin
      .from('tournament_entries')
      .select('id, category_id')
      .eq('player_id', playerId);

    if (!entries || entries.length === 0) return false;

    const categoryIds = [...new Set(entries.map((e) => e.category_id))];
    const entryIds = new Set(entries.map((e) => e.id));

    // One query for every match in the relevant categories, instead of two
    // round trips per entry (max-round lookup + winner check).
    const { data: catMatches } = await admin
      .from('matches')
      .select('category_id, round, winner_entry_id')
      .in('category_id', categoryIds);

    const maxRoundByCategory = new Map<string, number>();
    for (const m of catMatches ?? []) {
      const current = maxRoundByCategory.get(m.category_id) ?? -Infinity;
      if (m.round > current) maxRoundByCategory.set(m.category_id, m.round);
    }

    return (catMatches ?? []).some(
      (m) =>
        m.winner_entry_id != null &&
        entryIds.has(m.winner_entry_id) &&
        m.round === maxRoundByCategory.get(m.category_id),
    );
  })();

  // ── Follower count ─────────────────────────────────────────────────────────
  const { count: followerCount } = await admin
    .from('player_follows')
    .select('*', { count: 'exact', head: true })
    .eq('following_id', playerId);

  // ── Determine earned badges ───────────────────────────────────────────────
  const toAward: string[] = [];

  if (totalMatches >= 1)          toAward.push('first_match');
  if (wins >= 1)                  toAward.push('first_win');
  if (wins >= 10)                 toAward.push('ten_wins');
  if (wins >= 50)                 toAward.push('fifty_wins');
  if (totalMatches >= 50)         toAward.push('veteran');
  if (hatTrick)                   toAward.push('hat_trick');
  if (peakRating >= 4.0)          toAward.push('rising_star');
  if (isTournamentChampion)       toAward.push('tournament_champion');
  if ((followerCount ?? 0) >= 10) toAward.push('well_connected');

  if (toAward.length === 0) return;

  await admin
    .from('player_badges')
    .upsert(
      toAward.map((slug) => ({ player_id: playerId, badge_slug: slug })),
      { onConflict: 'player_id,badge_slug', ignoreDuplicates: true },
    );
}

/** Return earned badge slugs for a player (for display). */
export async function getPlayerBadges(playerId: string): Promise<string[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('player_badges')
    .select('badge_slug')
    .eq('player_id', playerId)
    .order('awarded_at', { ascending: true });

  return (data ?? []).map((b) => b.badge_slug);
}
