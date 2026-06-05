import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { createClient, createAdminClient, getUserRoles } from '@/lib/supabase/server';
import { AppNav } from '@/components/layout/AppNav';

export const metadata: Metadata = { title: 'Analytics' };

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AnalyticsPage({ params }: Props) {
  const { id: slug } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();

  const { data: t } = await admin
    .from('tournaments')
    .select('id, name, club_id, start_date, end_date, court_count')
    .eq('slug', slug)
    .single();
  if (!t) notFound();

  const { data: mgr } = await admin
    .from('club_managers')
    .select('role')
    .eq('club_id', t.club_id)
    .eq('player_id', user.id)
    .maybeSingle();
  if (!mgr) notFound();

  // Mode guard
  const roles = getUserRoles(user);
  const isAdminRole = roles.includes('admin');
  const isPlayerRole = roles.includes('player') || roles.length === 0;
  const hasBothRoles = isAdminRole && isPlayerRole;
  const rawMode = (await cookies()).get('active_mode')?.value;
  const activeMode: 'admin' | 'player' = hasBothRoles
    ? (rawMode === 'player' ? 'player' : 'admin')
    : isAdminRole ? 'admin' : 'player';
  if (activeMode === 'player') redirect(`/events/${slug}`);

  // ── Fetch all data in parallel ─────────────────────────────────────────────

  const [matchesRes, entriesRes, catsRes, historyRes] = await Promise.all([
    admin
      .from('matches')
      .select('id, status, court, scheduled_time, completed_at, category_id')
      .eq('tournament_id', t.id)
      .not('entry_a_id', 'is', null)
      .not('entry_b_id', 'is', null),
    admin
      .from('tournament_entries')
      .select('id, category_id, status')
      .eq('tournament_id', t.id),
    admin
      .from('tournament_categories')
      .select('id, name, status, draw_format')
      .eq('tournament_id', t.id),
    admin
      .from('match_history')
      .select('player_id, result, rating_change, played_at')
      .eq('tournament_id', t.id)
      .limit(200),
  ]);

  const matches = matchesRes.data ?? [];
  const entries = entriesRes.data ?? [];
  const categories = catsRes.data ?? [];

  // ── Compute analytics ──────────────────────────────────────────────────────

  const total = matches.length;
  const completed = matches.filter((m) => m.status === 'completed' || m.status === 'walkover').length;
  const inProgress = matches.filter((m) => m.status === 'in_progress').length;
  const scheduled = matches.filter((m) => m.status === 'scheduled').length;
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

  const activeEntries = entries.filter((e) => e.status === 'active').length;

  // Matches per day (using scheduled_time or completed_at)
  const matchesByDay = new Map<string, { total: number; done: number }>();
  for (const m of matches) {
    const dateStr = m.scheduled_time
      ? m.scheduled_time.slice(0, 10)
      : m.completed_at
      ? m.completed_at.slice(0, 10)
      : null;
    if (!dateStr) continue;
    const entry = matchesByDay.get(dateStr) ?? { total: 0, done: 0 };
    entry.total += 1;
    if (m.status === 'completed' || m.status === 'walkover') entry.done += 1;
    matchesByDay.set(dateStr, entry);
  }
  const days = Array.from(matchesByDay.entries()).sort(([a], [b]) => a.localeCompare(b));

  // Court utilisation: how many scheduled matches per court
  const courtLoad = new Map<number, number>();
  for (const m of matches) {
    if (m.court === null) continue;
    courtLoad.set(m.court, (courtLoad.get(m.court) ?? 0) + 1);
  }
  const courts = Array.from(courtLoad.entries())
    .sort(([a], [b]) => a - b);
  const maxCourtLoad = courts.length > 0 ? Math.max(...courts.map(([, v]) => v)) : 1;

  // Category progress
  const catEntries = new Map<string, number>();
  for (const e of entries.filter((e) => e.status === 'active')) {
    catEntries.set(e.category_id, (catEntries.get(e.category_id) ?? 0) + 1);
  }
  const catMatches = new Map<string, { total: number; done: number }>();
  for (const m of matches) {
    const cm = catMatches.get(m.category_id) ?? { total: 0, done: 0 };
    cm.total += 1;
    if (m.status === 'completed' || m.status === 'walkover') cm.done += 1;
    catMatches.set(m.category_id, cm);
  }

  // Rating changes (top gainers / losers)
  type HistRow = { player_id: string; result: string; rating_change: number; played_at: string };
  const history = (historyRes.data ?? []) as unknown as HistRow[];

  // Aggregate net rating change per player
  const ratingChanges = new Map<string, number>();
  for (const h of history) {
    // rating_change is always positive — negate it for losers
    const delta = h.result === 'win' ? h.rating_change : -h.rating_change;
    ratingChanges.set(h.player_id, (ratingChanges.get(h.player_id) ?? 0) + delta);
  }

  // Load player names for top movers
  const playerIds = [...ratingChanges.keys()].slice(0, 20);
  const { data: players } = playerIds.length > 0
    ? await admin
        .from('players')
        .select('id, full_name')
        .in('id', playerIds)
    : { data: [] };

  const playerNameMap = new Map((players ?? []).map((p) => [p.id, p.full_name]));

  const topMovers = [...ratingChanges.entries()]
    .sort(([, a], [, b]) => Math.abs(b) - Math.abs(a))
    .slice(0, 8)
    .map(([id, delta]) => ({ name: playerNameMap.get(id) ?? 'Unknown', delta }));

  return (
    <div className="min-h-screen bg-surface">
      <AppNav />

      <main className="mx-auto max-w-5xl px-6 py-10">
        <nav className="mb-6 flex items-center gap-2 text-xs text-slate-500 sm:text-sm">
          <Link href={`/tournaments/${slug}`} className="hover:text-slate-300 transition-colors">
            {t.name}
          </Link>
          <span>/</span>
          <span className="text-slate-400">Analytics</span>
        </nav>

        <h1 className="mb-8 text-2xl font-bold text-white">Analytics</h1>

        {/* ── Key stats ─────────────────────────────────────────────────────── */}
        <div className="mb-8 grid gap-4 grid-cols-2 sm:grid-cols-4">
          {[
            { label: 'Total matches', value: total, sub: `${inProgress} live · ${scheduled} scheduled` },
            { label: 'Completed', value: `${completionRate}%`, sub: `${completed} of ${total}` },
            { label: 'Players', value: activeEntries, sub: `across ${categories.length} categories` },
            { label: 'Courts', value: t.court_count, sub: courts.length > 0 ? `${courts.length} in use` : 'none assigned' },
          ].map((s) => (
            <div key={s.label} className="rounded-xl bg-surface-card p-5 ring-1 ring-surface-border">
              <p className="text-2xl font-bold text-white">{s.value}</p>
              <p className="mt-0.5 text-xs font-medium text-slate-400">{s.label}</p>
              <p className="mt-1 text-xs text-slate-600">{s.sub}</p>
            </div>
          ))}
        </div>

        {/* ── Completion bar ─────────────────────────────────────────────────── */}
        <div className="mb-8 rounded-xl bg-surface-card p-5 ring-1 ring-surface-border">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-300">Tournament progress</p>
            <p className="text-sm font-bold text-white">{completionRate}%</p>
          </div>
          <div className="h-3 rounded-full bg-surface overflow-hidden">
            <div
              className="h-full rounded-full bg-brand-500 transition-all"
              style={{ width: `${completionRate}%` }}
            />
          </div>
          <div className="mt-2 flex items-center gap-4 text-xs text-slate-600">
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-brand-500" /> {completed} done
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-accent-400" /> {inProgress} live
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-slate-700" /> {scheduled} upcoming
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* ── Matches per day ────────────────────────────────────────────── */}
          {days.length > 0 && (
            <div className="rounded-xl bg-surface-card p-5 ring-1 ring-surface-border">
              <h2 className="mb-4 text-sm font-semibold text-slate-400 uppercase tracking-wide">
                Matches per day
              </h2>
              <div className="space-y-3">
                {days.map(([date, { total: dt, done }]) => {
                  const pct = dt > 0 ? (done / dt) * 100 : 0;
                  return (
                    <div key={date}>
                      <div className="mb-1 flex items-center justify-between">
                        <p className="text-xs text-slate-400">
                          {new Date(date + 'T00:00:00').toLocaleDateString('en-AU', {
                            weekday: 'short', day: 'numeric', month: 'short',
                          })}
                        </p>
                        <p className="text-xs text-slate-500">{done}/{dt}</p>
                      </div>
                      <div className="h-2 rounded-full bg-surface overflow-hidden">
                        <div
                          className="h-full rounded-full bg-brand-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Court utilisation ──────────────────────────────────────────── */}
          {courts.length > 0 && (
            <div className="rounded-xl bg-surface-card p-5 ring-1 ring-surface-border">
              <h2 className="mb-4 text-sm font-semibold text-slate-400 uppercase tracking-wide">
                Court utilisation
              </h2>
              <div className="space-y-3">
                {courts.map(([court, load]) => {
                  const pct = (load / maxCourtLoad) * 100;
                  return (
                    <div key={court}>
                      <div className="mb-1 flex items-center justify-between">
                        <p className="text-xs text-slate-400">Court {court}</p>
                        <p className="text-xs text-slate-500">{load} matches</p>
                      </div>
                      <div className="h-2 rounded-full bg-surface overflow-hidden">
                        <div
                          className="h-full rounded-full bg-accent-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Category progress ──────────────────────────────────────────── */}
          <div className="rounded-xl bg-surface-card p-5 ring-1 ring-surface-border">
            <h2 className="mb-4 text-sm font-semibold text-slate-400 uppercase tracking-wide">
              Category progress
            </h2>
            {categories.length === 0 ? (
              <p className="text-sm text-slate-600">No categories yet</p>
            ) : (
              <div className="space-y-4">
                {categories.map((cat) => {
                  const cm = catMatches.get(cat.id) ?? { total: 0, done: 0 };
                  const pct = cm.total > 0 ? Math.round((cm.done / cm.total) * 100) : 0;
                  const statusBadge: Record<string, string> = {
                    pending: 'bg-slate-700 text-slate-400',
                    registration: 'bg-blue-900/40 text-blue-400',
                    draw_generated: 'bg-brand-900/40 text-brand-300',
                    in_progress: 'bg-accent-500/20 text-accent-400',
                    completed: 'bg-slate-700/40 text-slate-400',
                  };
                  return (
                    <div key={cat.id}>
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <p className="text-xs font-medium text-slate-300 truncate">{cat.name}</p>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusBadge[cat.status] ?? 'bg-slate-700 text-slate-400'}`}>
                            {cat.status.replace('_', ' ')}
                          </span>
                          <span className="text-xs text-slate-600">{cm.done}/{cm.total}</span>
                        </div>
                      </div>
                      {cm.total > 0 && (
                        <div className="h-1.5 rounded-full bg-surface overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${cat.status === 'completed' ? 'bg-brand-500' : 'bg-accent-500'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Rating movers ──────────────────────────────────────────────── */}
          {topMovers.length > 0 && (
            <div className="rounded-xl bg-surface-card p-5 ring-1 ring-surface-border">
              <h2 className="mb-4 text-sm font-semibold text-slate-400 uppercase tracking-wide">
                Biggest rating movers
              </h2>
              <div className="space-y-2">
                {topMovers.map((p, i) => (
                  <div key={i} className="flex items-center justify-between gap-3">
                    <p className="text-xs font-medium text-slate-300 truncate">{p.name}</p>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums ${
                        p.delta >= 0
                          ? 'bg-accent-500/20 text-accent-400'
                          : 'bg-red-900/30 text-red-400'
                      }`}
                    >
                      {p.delta >= 0 ? '+' : ''}{p.delta.toFixed(0)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
