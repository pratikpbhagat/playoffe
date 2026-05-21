import Image from 'next/image';
import type { Database } from '@pickleball/db';

type PlayerRow = Database['public']['Tables']['players']['Row'];
type ProfileRow = Database['public']['Tables']['player_profiles']['Row'];
type StatsRow = Database['public']['Tables']['global_stats']['Row'];

interface Props {
  player: PlayerRow & {
    player_profiles: ProfileRow | null;
    global_stats: StatsRow | null;
  };
}

export function PlayerProfileView({ player }: Props) {
  const stats = player.global_stats;
  const profile = player.player_profiles;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-3xl px-4 py-12">
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
          <div className="h-32 bg-gradient-to-r from-brand-600 to-brand-400" />

          <div className="px-8 pb-8">
            <div className="-mt-16 flex items-end gap-5">
              <div className="relative h-32 w-32 overflow-hidden rounded-full ring-4 ring-white">
                {player.photo_url ? (
                  <Image src={player.photo_url} alt={player.full_name} fill className="object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-brand-100 text-4xl font-bold text-brand-600">
                    {player.full_name.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="mb-2">
                <h1 className="text-2xl font-bold text-gray-900">{player.full_name}</h1>
                {profile?.headline && (
                  <p className="text-sm text-gray-500">{profile.headline}</p>
                )}
                {player.location && (
                  <p className="mt-1 text-xs text-gray-400">{player.location}</p>
                )}
              </div>
            </div>

            {profile?.bio && (
              <p className="mt-6 text-sm leading-relaxed text-gray-700">{profile.bio}</p>
            )}

            {stats && (
              <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <StatCard label="Rating" value={stats.current_rating.toFixed(2)} />
                <StatCard label="Matches" value={stats.total_matches.toString()} />
                <StatCard label="Wins" value={stats.wins.toString()} />
                <StatCard label="Win rate" value={`${(stats.win_rate * 100).toFixed(0)}%`} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-gray-50 px-4 py-4 text-center">
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="mt-1 text-xs font-medium text-gray-500">{label}</p>
    </div>
  );
}
