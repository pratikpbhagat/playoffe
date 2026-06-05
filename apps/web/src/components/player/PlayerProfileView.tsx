import Image from 'next/image';
import Link from 'next/link';
import type { Database } from '@pickleball/db';
import { AppNav } from '@/components/layout/AppNav';
import { BadgeList } from '@/components/player/BadgeList';
import { FollowButton } from '@/components/player/FollowButton';
import { RatingHistoryChart } from '@/components/player/RatingHistoryChart';
import type { MatchHistoryRow, RatingHistoryPoint } from '@/app/p/[username]/page';

type PlayerRow = Database['public']['Tables']['players']['Row'];
type ProfileRow = Database['public']['Tables']['player_profiles']['Row'];
type StatsRow = Database['public']['Tables']['global_stats']['Row'];

interface CareerEntry { role: string; club: string; years: string }
interface Certification { name: string; issuer: string; year: number }

interface Props {
  player: PlayerRow & {
    player_profiles: ProfileRow | null;
    global_stats: StatsRow | null;
  };
  matchHistory: MatchHistoryRow[];
  ratingHistory: RatingHistoryPoint[];
  isOwnProfile: boolean;
  badges: string[];
  isFollowing: boolean;
  followerCount: number;
  isLoggedIn: boolean;
  viewerUsername: string | null;
}

const RESULT_STYLE: Record<string, { label: string; color: string }> = {
  win:           { label: 'W', color: 'text-accent-400 bg-accent-500/10' },
  loss:          { label: 'L', color: 'text-red-400 bg-red-500/10' },
  walkover_win:  { label: 'W/O', color: 'text-accent-400/70 bg-accent-500/10' },
  walkover_loss: { label: 'W/O', color: 'text-slate-500 bg-slate-700/30' },
};

export function PlayerProfileView({ player, matchHistory, ratingHistory, isOwnProfile, badges, isFollowing, followerCount, isLoggedIn, viewerUsername }: Props) {
  const stats = player.global_stats;
  const profile = player.player_profiles;

  const careerHistory = (profile?.career_history as CareerEntry[] | null) ?? [];
  const certifications = (profile?.certifications as Certification[] | null) ?? [];
  const preferredStyle = (profile as { preferred_style?: string | null } | null)?.preferred_style ?? null;

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

              {/* Action buttons — hidden on mobile, shown on sm+ alongside avatar */}
              <div className="mb-1 hidden sm:flex items-center gap-2 flex-wrap">
                {isOwnProfile ? (
                  <>
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
                    <a
                      href={`/api/players/${player.username}/schedule.ics`}
                      download
                      title="Subscribe to your upcoming match schedule"
                      className="rounded-lg border border-surface-border px-3 py-1.5 text-xs text-slate-400 hover:bg-surface hover:text-white transition-colors"
                    >
                      🗓 My schedule
                    </a>
                  </>
                ) : isLoggedIn ? (
                  <>
                    <FollowButton
                      targetId={player.id}
                      initialIsFollowing={isFollowing}
                      initialCount={followerCount}
                    />
                    {viewerUsername && (
                      <Link
                        href={`/p/${player.username}/h2h/${viewerUsername}`}
                        className="rounded-lg border border-surface-border px-3 py-1.5 text-xs font-medium text-slate-400 hover:bg-surface hover:text-white transition-colors"
                        title="Head-to-head record"
                      >
                        H2H
                      </Link>
                    )}
                  </>
                ) : null}
              </div>
            </div>

            {/* Mobile-only action buttons — stacked vertically below avatar on small screens */}
            {isOwnProfile && (
              <div className="mt-3 flex flex-col gap-2 sm:hidden">
                <Link
                  href="/settings/profile"
                  className="w-full text-center rounded-lg bg-brand-600/20 border border-brand-600/40 px-3 py-2 text-xs font-semibold text-brand-300 hover:bg-brand-600/30 transition-colors"
                >
                  Edit profile
                </Link>
                <div className="flex gap-2">
                  <Link
                    href="/dashboard"
                    className="flex-1 text-center rounded-lg border border-surface-border px-3 py-2 text-xs text-slate-400 hover:bg-surface hover:text-white transition-colors"
                  >
                    ← Dashboard
                  </Link>
                  <a
                    href={`/api/players/${player.username}/schedule.ics`}
                    download
                    title="Subscribe to your upcoming match schedule"
                    className="flex-1 text-center rounded-lg border border-surface-border px-3 py-2 text-xs text-slate-400 hover:bg-surface hover:text-white transition-colors"
                  >
                    🗓 My schedule
                  </a>
                </div>
              </div>
            )}

            {/* Name + meta */}
            <div className="mt-4">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h1 className="text-2xl font-bold text-white">{player.full_name}</h1>
                <span className="text-xs text-slate-600">
                  {followerCount} {followerCount === 1 ? 'follower' : 'followers'}
                </span>
              </div>
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
            {/* Rating history sparkline */}
            {ratingHistory.length >= 2 && stats && (
              <div className="mt-5">
                <RatingHistoryChart
                  data={ratingHistory}
                  currentRating={stats.current_rating}
                  peakRating={stats.peak_rating}
                />
              </div>
            )}

            {/* Preferred style */}
            {preferredStyle && (
              <div className="mt-5">
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-slate-500">Playing style</p>
                <span className="inline-block rounded-full bg-brand-600/15 px-3 py-1 text-xs font-medium text-brand-300">
                  {preferredStyle}
                </span>
              </div>
            )}

            {/* Career history */}
            {careerHistory.length > 0 && (
              <div className="mt-5">
                <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">Career</p>
                <div className="space-y-1">
                  {careerHistory.map((entry, i) => (
                    <div key={i} className="flex items-baseline gap-2 text-sm">
                      <span className="text-slate-600 text-xs tabular-nums shrink-0">{entry.years}</span>
                      <span className="text-slate-300">{entry.role}</span>
                      {entry.club && <span className="text-slate-500 text-xs">· {entry.club}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Certifications */}
            {certifications.length > 0 && (
              <div className="mt-5">
                <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">Certifications</p>
                <div className="flex flex-wrap gap-2">
                  {certifications.map((cert, i) => (
                    <div key={i} className="rounded-lg bg-surface px-3 py-2 ring-1 ring-surface-border text-xs">
                      <p className="font-semibold text-slate-200">{cert.name}</p>
                      <p className="text-slate-500">{cert.issuer}{cert.year ? ` · ${cert.year}` : ''}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Badges */}
            <BadgeList slugs={badges} />
          </div>
        </div>

        {/* Tab nav */}
        <div className="mt-6 flex items-center gap-1 rounded-xl bg-surface p-1 ring-1 ring-surface-border w-fit">
          {[
            { label: 'Profile', href: `/p/${player.username}` },
            { label: 'Matches', href: `/p/${player.username}/matches` },
            { label: 'Stats', href: `/p/${player.username}/stats` },
          ].map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className={`rounded-lg px-4 py-1.5 text-xs font-semibold transition-colors ${
                tab.label === 'Profile'
                  ? 'bg-brand-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </div>

        {/* Match history */}
        {matchHistory.length > 0 && (
          <section className="mt-6">
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
