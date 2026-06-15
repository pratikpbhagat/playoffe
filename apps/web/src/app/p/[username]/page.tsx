import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getPlayerByUsername } from '@pickleball/db';
import { PlayerProfileView } from '@/components/player/PlayerProfileView';
import { getPlayerBadges } from '@/lib/actions/badges';
import { getIsFollowing } from '@/lib/actions/follows';

interface Props {
  params: Promise<{ username: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const supabase = await createClient();
  try {
    const player = await getPlayerByUsername(supabase, username);
    return {
      title: `${player.full_name} · PLAYOFFE`,
      description: player.player_profiles?.bio ?? `Pickleball player profile for ${player.full_name}`,
      openGraph: {
        title: player.full_name,
        images: [`/api/players/${username}/card.png`],
      },
      twitter: {
        card: 'summary_large_image',
        images: [`/api/players/${username}/card.png`],
      },
    };
  } catch {
    return { title: 'Player not found' };
  }
}

export type MatchHistoryRow = {
  id: string;
  result: string;
  sets: { set_number: number; score_a: number; score_b: number }[];
  rating_before: number;
  rating_after: number;
  rating_change: number;
  played_at: string;
  tournament_name: string | null;
  opponent_name: string | null;
};

export type RatingHistoryPoint = { played_at: string; rating_after: number };

export default async function PlayerProfilePage({ params }: Props) {
  const { username } = await params;

  const supabase = await createClient();
  const admin = createAdminClient();

  // Check current viewer
  const { data: { user } } = await supabase.auth.getUser();

  let player;
  try {
    player = await getPlayerByUsername(supabase, username);
  } catch {
    notFound();
  }

  const isOwnProfile = user?.id === player.id;

  // Fetch badges, follower count, following state, and (if viewing someone
  // else's profile) the viewer's own username for the H2H link — in parallel.
  const [badges, isFollowing, followerCountResult, viewerPlayer] = await Promise.all([
    getPlayerBadges(player.id),
    user && !isOwnProfile ? getIsFollowing(player.id) : Promise.resolve(false),
    createAdminClient()
      .from('player_follows')
      .select('*', { count: 'exact', head: true })
      .eq('following_id', player.id),
    user && !isOwnProfile
      ? supabase.from('players').select('username').eq('id', user.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const followerCount = followerCountResult.count ?? 0;
  const viewerUsername: string | null = viewerPlayer?.data?.username ?? null;

  // Fetch rating history for sparkline (last 30 matches, chronological)
  const { data: ratingHistoryRaw } = await admin
    .from('match_history')
    .select('played_at, rating_after')
    .eq('player_id', player.id)
    .in('result', ['win', 'loss'])
    .order('played_at', { ascending: true })
    .limit(30);

  const ratingHistory: RatingHistoryPoint[] = (ratingHistoryRaw ?? []).map((r) => ({
    played_at: r.played_at,
    rating_after: r.rating_after as unknown as number,
  }));

  // Fetch recent match history (admin bypasses RLS so public profiles show history)
  const { data: rawHistory } = await admin
    .from('match_history')
    .select('id, result, sets, rating_before, rating_after, rating_change, played_at, tournament_id, opponent_entry_id')
    .eq('player_id', player.id)
    .order('played_at', { ascending: false })
    .limit(5);

  let matchHistory: MatchHistoryRow[] = [];

  if (rawHistory && rawHistory.length > 0) {
    // Batch-fetch tournament names
    const tournamentIds = [...new Set(rawHistory.map((h) => h.tournament_id))];
    const { data: tournaments } = await admin
      .from('tournaments')
      .select('id, name')
      .in('id', tournamentIds);

    const tournamentMap = new Map((tournaments ?? []).map((t) => [t.id, t.name]));

    // Batch-fetch opponent names via entry → player join
    const entryIds = rawHistory.map((h) => h.opponent_entry_id).filter(Boolean) as string[];
    let opponentMap = new Map<string, string>();
    if (entryIds.length > 0) {
      const { data: entries } = await admin
        .from('tournament_entries')
        .select('id, players!player_id(full_name)')
        .in('id', entryIds);
      opponentMap = new Map(
        (entries ?? []).map((e) => [
          e.id,
          (e.players as { full_name: string } | null)?.full_name ?? 'Unknown',
        ]),
      );
    }

    matchHistory = rawHistory.map((h) => ({
      id: h.id,
      result: h.result,
      sets: (h.sets as { set_number: number; score_a: number; score_b: number }[]) ?? [],
      rating_before: h.rating_before as unknown as number,
      rating_after: h.rating_after as unknown as number,
      rating_change: h.rating_change as unknown as number,
      played_at: h.played_at,
      tournament_name: tournamentMap.get(h.tournament_id) ?? null,
      opponent_name: h.opponent_entry_id ? (opponentMap.get(h.opponent_entry_id) ?? null) : null,
    }));
  }

  return (
    <PlayerProfileView
      player={player}
      matchHistory={matchHistory}
      ratingHistory={ratingHistory}
      isOwnProfile={isOwnProfile}
      badges={badges}
      isFollowing={isFollowing}
      followerCount={followerCount}
      isLoggedIn={!!user}
      viewerUsername={viewerUsername}
    />
  );
}
