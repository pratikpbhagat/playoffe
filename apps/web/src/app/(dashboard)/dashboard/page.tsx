import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { AppNav } from '@/components/layout/AppNav';
import { getMyTournaments } from '@/lib/actions/tournaments';
import { getMyClubs } from '@/lib/actions/clubs';

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-slate-700 text-slate-300' },
  registration_open: { label: 'Registration open', className: 'bg-blue-900/60 text-blue-300' },
  in_progress: { label: 'In progress', className: 'bg-accent-500/20 text-accent-400' },
  completed: { label: 'Completed', className: 'bg-brand-600/20 text-brand-300' },
  cancelled: { label: 'Cancelled', className: 'bg-red-900/40 text-red-400' },
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: player } = await supabase
    .from('players')
    .select('*, global_stats(*)')
    .eq('id', user.id)
    .single();

  const [tournaments, clubs] = await Promise.all([getMyTournaments(), getMyClubs()]);

  return (
    <div className="min-h-screen bg-surface">
      <AppNav />

      <main className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="text-2xl font-bold text-white">
          Welcome back, {player?.full_name ?? 'Player'} 👋
        </h1>

        {/* Stats row */}
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              label: 'Rating',
              value: player?.global_stats?.current_rating?.toFixed(2) ?? '3.50',
            },
            { label: 'Matches', value: player?.global_stats?.total_matches ?? 0 },
            { label: 'Wins', value: player?.global_stats?.wins ?? 0 },
            {
              label: 'Win rate',
              value: `${(((player?.global_stats?.win_rate ?? 0) as number) * 100).toFixed(0)}%`,
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl bg-surface-card p-6 ring-1 ring-surface-border"
            >
              <p className="text-3xl font-bold text-white">{stat.value}</p>
              <p className="mt-1 text-sm text-slate-400">{stat.label}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-3">
          {/* Quick actions */}
          <div className="rounded-xl bg-surface-card p-6 ring-1 ring-surface-border">
            <h2 className="text-base font-semibold text-white">Quick actions</h2>
            <div className="mt-4 space-y-3">
              <Link
                href="/tournaments/new"
                className="flex items-center gap-3 rounded-lg border border-surface-border p-3 hover:bg-surface transition-colors"
              >
                <span className="text-xl">🏆</span>
                <span className="text-sm font-medium text-slate-300">New tournament</span>
              </Link>
              <Link
                href="/clubs/new"
                className="flex items-center gap-3 rounded-lg border border-surface-border p-3 hover:bg-surface transition-colors"
              >
                <span className="text-xl">🏟️</span>
                <span className="text-sm font-medium text-slate-300">Create a club</span>
              </Link>
              <Link
                href={player ? `/p/${player.username}` : '#'}
                className="flex items-center gap-3 rounded-lg border border-surface-border p-3 hover:bg-surface transition-colors"
              >
                <span className="text-xl">👤</span>
                <span className="text-sm font-medium text-slate-300">View my profile</span>
              </Link>
            </div>
          </div>

          {/* My clubs */}
          <div className="rounded-xl bg-surface-card p-6 ring-1 ring-surface-border">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-white">My clubs</h2>
              <Link
                href="/clubs/new"
                className="text-xs text-brand-400 hover:text-brand-300 transition-colors"
              >
                + New
              </Link>
            </div>
            {clubs.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">
                No clubs yet.{' '}
                <Link href="/clubs/new" className="text-brand-400 hover:text-brand-300">
                  Create one →
                </Link>
              </p>
            ) : (
              <ul className="mt-4 space-y-2">
                {clubs.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/clubs/${c.id}`}
                      className="flex items-center gap-3 rounded-lg p-2 hover:bg-surface transition-colors"
                    >
                      <span
                        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
                        style={{ backgroundColor: c.brand_primary_color }}
                      >
                        {c.name[0]}
                      </span>
                      <span className="text-sm text-slate-300">{c.name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Recent tournaments */}
          <div className="rounded-xl bg-surface-card p-6 ring-1 ring-surface-border">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-white">My tournaments</h2>
              <Link
                href="/tournaments/new"
                className="text-xs text-brand-400 hover:text-brand-300 transition-colors"
              >
                + New
              </Link>
            </div>
            {tournaments.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">
                No tournaments yet.{' '}
                <Link href="/tournaments/new" className="text-brand-400 hover:text-brand-300">
                  Create one →
                </Link>
              </p>
            ) : (
              <ul className="mt-4 space-y-2">
                {tournaments.map((t) => {
                  const badge = STATUS_BADGE[t.status] ?? STATUS_BADGE.draft;
                  return (
                    <li key={t.id}>
                      <Link
                        href={`/tournaments/${t.id}`}
                        className="flex items-center justify-between rounded-lg p-2 hover:bg-surface transition-colors"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm text-slate-300">{t.name}</p>
                          <p className="text-xs text-slate-500">
                            {new Date(t.start_date).toLocaleDateString('en-AU', {
                              day: 'numeric',
                              month: 'short',
                            })}
                          </p>
                        </div>
                        <span
                          className={`ml-2 flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
