import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { unstable_cache } from 'next/cache';
import { createAdminClient, createClient, getCurrentUser } from '@/lib/supabase/server';
import { getPlayerByUsername } from '@pickleball/db';
import { PlayerProfileView } from '@/components/player/PlayerProfileView';
import { getPlayerBadges } from '@/lib/actions/badges';
import { getIsFollowing } from '@/lib/actions/follows';

interface Props {
  params: Promise<{ username: string }>;
}

// Public profile data — same for every visitor, expensive to compute.
// Cached for 1 hour per username; invalidated after ratings recalculation
// or match submission via revalidateTag('player-profile-{username}').
async function getPublicProfileData(username: string) {
  const supabase = await createClient();
  const admin = createAdminClient();

  let player;
  try {
    player = await getPlayerByUsername(supabase, username);
  } catch {
    return null;
  }

  const [badges, followerCountResult, { data: ratingHistoryRaw }, { data: rawHistory }] =
    await Promise.all([
      getPlayerBadges(player.id),
      createAdminClient()
        .from('player_follows')
        .select('*', { count: 'exact', head: true })
        .eq('following_id', player.id),
      admin
        .from('match_history')
        .select('played_at, rating_after')
        .eq('player_id', player.id)
        .in('result', ['win', 'loss'])
        .order('played_at', { ascending: true })
        .limit(30),
      admin
        .from('match_history')
        .select('id, result, sets, rating_before, rating_after, rating_change, played_at, tournament_id, opponent_entry_id')
        .eq('player_id', player.id)
        .order('played_at', { ascending: false })
        .limit(5),
    ]);

  const followerCount = followerCountResult.count ?? 0;

  const ratingHistory: RatingHistoryPoint[] = (ratingHistoryRaw ?? []).map((r) => ({
    played_at: r.played_at,
    rating_after: r.rating_after as unknown as number,
  }));

  let matchHistory: MatchHistoryRow[] = [];
  if (rawHistory && rawHistory.length > 0) {
    const tournamentIds = [...new Set(rawHistory.map((h) => h.tournament_id))];
    const entryIds = rawHistory.map((h) => h.opponent_entry_id).filter(Boolean) as string[];

    const [{ data: tournaments }, { data: entries }] = await Promise.all([
      admin.from('tournaments').select('id, name').in('id', tournamentIds),
      entryIds.length > 0
        ? admin.from('tournament_entries').select('id, players!player_id(full_name)').in('id', entryIds)
        : Promise.resolve({ data: [] }),
    ]);

    const tournamentMap = new Map((tournaments ?? []).map((t) => [t.id, t.name]));
    const opponentMap = new Map(
      (entries ?? []).map((e) => [
        e.id,
        (e.players as { full_name: string } | null)?.full_name ?? 'Unknown',
      ]),
    );

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

  return { player, badges, followerCount, ratingHistory, matchHistory };
}

const getCachedProfileData = unstable_cache(
  getPublicProfileData,
  ['public-player-profile'],
  { revalidate: 3600, tags: ['public-player-profile'] },
);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const data = await getCachedProfileData(username);
  if (!data) return { title: 'Player not found' };
  const { player } = data;
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

  // Public profile data served from Next.js Data Cache (1 h TTL).
  const publicData = await getCachedProfileData(username);
  if (!publicData) notFound();

  const { player, badges, followerCount, ratingHistory, matchHistory } = publicData;

  // Viewer-specific state — dynamic, not cached (depends on who is logged in).
  const supabase = await createClient();
  const user = await getCurrentUser();
  const isOwnProfile = user?.id === player.id;

  const [isFollowing, viewerPlayer] = await Promise.all([
    user && !isOwnProfile ? getIsFollowing(player.id) : Promise.resolve(false),
    user && !isOwnProfile
      ? supabase.from('players').select('username').eq('id', user.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const viewerUsername: string | null = viewerPlayer?.data?.username ?? null;

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
