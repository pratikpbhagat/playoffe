import Image from 'next/image';
import Link from 'next/link';
import type { Database } from '@pickleball/db';
import { AppNav } from '@/components/layout/AppNav';
import type { MatchHistoryRow } from '@/app/p/[username]/page';

type PlayerRow = Database['public']['Tables']['players']['Row'];
type ProfileRow = Database['public']['Tables']['player_profiles']['Row'];
type StatsRow = Database['public']['Tables']['global_stats']['Row'];

interface Props {
  player: PlayerRow & {
    player_profiles: ProfileRow | null;
    global_stats: StatsRow | null;
  };
  matchHistory: MatchHistoryRow[];
  isOwnProfile: boolean;
}

const RESULT_STYLE: Record<string, { label: string; color: string }> = {
  win:           { label: 'W', color: 'text-accent-400 bg-accent-500/10' },
  loss:          { label: 'L', color: 'text-red-400 bg-red-500/10' },
  walkover_win:  { label: 'W/O', color: 'text-accent-400/70 bg-accent-500/10' },
  walkover_loss: { label: 'W/O', color: 'text-slate-500 bg-slate-700/30' },
};

export function PlayerProfileView({ player, matchHistory, isOwnProfile }: Props) {
  const stats = player.global_stats;
  const profile = player.player_profiles;

  return (
    <div className="min-h-screen bg-surface">
      <AppNav />

      <main className="mx-auto max-w-3xl px-4 py-10">
        {/* Profile card */}
        <div className="overflow-hidden rounded-2xl bg-surface-card ring-1 ring-surface-border">
          {/* Banner */}
          <div className="h-28 bg-gradient-to-r from-brand-900 via-brand-700 to-brand-500" />

          <div className="px-8 pb-8">
            {/* Avatar row */}
            <div className="-mt-14 flex items-end justify-between gap-4">
              <div className="relative h-28 w-28 overflow-hidden rounded-full ring-4 ring-surface-card shrink-0">
                {player.photo_url ? (
                  <Image src={player.photo_url} alt={player.full_name} fill className="object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-brand-900 text-4xl font-bold text-brand-300">
                    {player.full_name.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>

              {isOwnProfile && (
                <div className="mb-1 flex items-center gap-2">
                  <Link
                    href="/settings/profile"
                    className="rounded-lg bg-brand-600/20 border border-brand-600/40 px-3 py-1.5 text-xs font-semibold text-brand-300 hover:bg-brand-600/30 transition-colors"
                  >
                    Edit profile
                  </Link>
                  <Link
                    href="/dashboard"
                    className="rounded-lg border border-surface-border px-3 py-1.5 text-xs text-slate-400 hover:bg-surface hover:text-white transition-colors"
                  >
                    ← Dashboard
                  </Link>
                </div>
              )}
            </div>

            {/* Name + meta */}
            <div className="mt-4">
              <h1 className="text-2xl font-bold text-white">{player.full_name}</h1>
              <p className="text-sm text-slate-500">@{player.username}</p>
              {profile?.headline && (
                <p className="mt-1 text-sm text-slate-400">{profile.headline}</p>
              )}
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                {player.location && (
                  <p className="flex items-center gap-1 text-xs text-slate-600">
                    <span>📍</span> {player.location}
                  </p>
                )}
                {profile?.playing_since && (
                  <p className="flex items-center gap-1 text-xs text-slate-600">
                    <span>🏓</span> Playing since {profile.playing_since}
                  </p>
                )}
              </div>
            </div>

            {profile?.bio && (
              <p className="mt-5 text-sm leading-relaxed text-slate-300">{profile.bio}</p>
            )}

            {/* Main stats */}
            {stats && (
              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatCard label="Rating" value={stats.current_rating.toFixed(2)} highlight />
                <StatCard label="Peak" value={stats.peak_rating.toFixed(2)} />
                <StatCard label="Matches" value={stats.total_matches.toString()} />
                <StatCard
                  label="Win rate"
                  value={`${(stats.win_rate * 100).toFixed(0)}%`}
                />
              </div>
            )}

            {/* Format breakdown */}
            {stats && (stats.singles_matches > 0 || stats.doubles_matches > 0 || stats.mixed_doubles_matches > 0) && (
              <div className="mt-5 rounded-xl bg-surface px-4 py-4 ring-1 ring-surface-border">
                <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
                  By format
                </p>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Singles', matches: stats.singles_matches, wins: stats.singles_wins },
                    { label: 'Doubles', matches: stats.doubles_matches, wins: stats.doubles_wins },
                    { label: 'Mixed', matches: stats.mixed_doubles_matches, wins: stats.mixed_doubles_wins },
                  ].map((f) => (
                    <div key={f.label} className="text-center">
                      <p className="text-lg font-bold text-white">{f.matches}</p>
                      <p className="text-xs text-slate-600">{f.label}</p>
                      {f.matches > 0 && (
                        <p className="mt-0.5 text-xs text-slate-500">
                          {f.wins}W / {f.matches - f.wins}L
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Match history */}
        {matchHistory.length > 0 && (
          <section className="mt-8">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-500">
                Recent matches
              </h2>
              <Link
                href={`/p/${player.username}/matches`}
                className="text-xs text-brand-400 hover:text-brand-300 transition-colors"
              >
                View all →
              </Link>
            </div>
            <div className="space-y-2">
              {matchHistory.map((h) => {
                const resultStyle = RESULT_STYLE[h.result] ?? { label: h.result, color: 'text-slate-500 bg-slate-700/30' };
                const scoreStr = h.sets.length > 0
                  ? h.sets.map((s) => `${s.score_a}-${s.score_b}`).join(', ')
                  : null;
                const ratingDelta = Number(h.rating_change);
                const deltaStr = ratingDelta >= 0 ? `+${ratingDelta.toFixed(2)}` : ratingDelta.toFixed(2);
                const deltaColor = ratingDelta > 0 ? 'text-accent-400' : ratingDelta < 0 ? 'text-red-400' : 'text-slate-500';

                return (
                  <div
                    key={h.id}
                    className="flex items-center gap-4 rounded-xl bg-surface-card px-5 py-3.5 ring-1 ring-surface-border"
                  >
                    {/* Result badge */}
                    <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-bold ${resultStyle.color}`}>
                      {resultStyle.label}
                    </span>

                    {/* Match info */}
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-medium text-white">
                        {h.opponent_name ? (
                          <>vs {h.opponent_name}</>
                        ) : (
                          <span className="italic text-slate-500">Opponent unknown</span>
                        )}
                      </p>
                      <p className="text-xs text-slate-600 mt-0.5">
                        {h.tournament_name ?? 'Tournament'}
                        {scoreStr ? ` · ${scoreStr}` : ''}
                      </p>
                    </div>

                    {/* Rating */}
                    <div className="shrink-0 text-right">
                      <p className={`text-sm font-bold tabular-nums ${deltaColor}`}>{deltaStr}</p>
                      <p className="text-xs text-slate-600">{Number(h.rating_after).toFixed(2)}</p>
                    </div>

                    {/* Date */}
                    <p className="shrink-0 text-xs text-slate-700 hidden sm:block">
                      {new Date(h.played_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {matchHistory.length === 0 && (
          <div className="mt-8 rounded-xl bg-surface-card p-8 text-center ring-1 ring-surface-border">
            <p className="text-2xl mb-2">🎾</p>
            <p className="text-sm text-slate-500">No matches recorded yet.</p>
          </div>
        )}
      </main>
    </div>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl px-4 py-4 text-center ring-1 ${highlight ? 'bg-brand-900/40 ring-brand-700/50' : 'bg-surface ring-surface-border'}`}>
      <p className={`text-2xl font-bold ${highlight ? 'text-brand-300' : 'text-white'}`}>{value}</p>
      <p className="mt-1 text-xs font-medium text-slate-500">{label}</p>
    </div>
  );
}
