import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { AppNav } from '@/components/layout/AppNav';

export const metadata: Metadata = { title: 'Scoring' };

interface Props {
  params: Promise<{ id: string }>;
}

const STATUS_STYLE: Record<string, string> = {
  scheduled: 'text-slate-500',
  in_progress: 'text-accent-400 font-semibold',
  completed: 'text-slate-600',
  walkover: 'text-slate-600',
};

const STATUS_LABEL: Record<string, string> = {
  scheduled: 'Scheduled',
  in_progress: '● Live',
  completed: 'Done',
  walkover: 'W/O',
};

export default async function ScoringHubPage({ params }: Props) {
  const { id: tournamentId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();

  // Verify manager access
  const { data: t } = await admin
    .from('tournaments')
    .select('id, name, club_id')
    .eq('id', tournamentId)
    .single();
  if (!t) notFound();

  const { data: mgr } = await admin
    .from('club_managers')
    .select('role')
    .eq('club_id', t.club_id)
    .eq('player_id', user.id)
    .maybeSingle();
  if (!mgr) notFound();

  // Fetch all non-bye matches with player names
  const { data: matches } = await admin
    .from('matches')
    .select(`
      id, round, round_name, group_name, status, court, scheduled_time, sets,
      ea:tournament_entries!entry_a_id(id, seed, players!player_id(full_name)),
      eb:tournament_entries!entry_b_id(id, seed, players!player_id(full_name)),
      tc:tournament_categories!category_id(name)
    `)
    .eq('tournament_id', tournamentId)
    .not('entry_a_id', 'is', null)
    .not('entry_b_id', 'is', null)
    .order('status')
    .order('round')
    .order('court');

  type MatchRow = {
    id: string;
    round: number;
    round_name: string | null;
    group_name: string | null;
    status: string;
    court: number | null;
    scheduled_time: string | null;
    sets: { set_number: number; score_a: number; score_b: number }[];
    ea: { id: string; seed: number | null; players: { full_name: string } | null } | null;
    eb: { id: string; seed: number | null; players: { full_name: string } | null } | null;
    tc: { name: string } | null;
  };

  const rows = (matches ?? []) as unknown as MatchRow[];

  const live = rows.filter((m) => m.status === 'in_progress');
  const scheduled = rows.filter((m) => m.status === 'scheduled');
  const done = rows.filter((m) => m.status === 'completed' || m.status === 'walkover');

  function MatchRow({ match }: { match: MatchRow }) {
    const aName = match.ea?.players?.full_name ?? 'TBD';
    const bName = match.eb?.players?.full_name ?? 'TBD';
    const sets = match.sets as { score_a: number; score_b: number }[] ?? [];
    const scoreStr = sets.length > 0
      ? sets.map((s) => `${s.score_a}-${s.score_b}`).join(', ')
      : null;

    return (
      <Link
        href={`/tournaments/${tournamentId}/scoring/${match.id}`}
        className="flex items-center gap-4 rounded-xl bg-surface-card px-5 py-3.5 ring-1 ring-surface-border hover:ring-brand-500/40 transition-all"
      >
        {/* Court */}
        <div className="w-14 shrink-0 text-center">
          {match.court ? (
            <span className="rounded bg-surface px-2 py-0.5 text-xs font-mono text-slate-400">
              Ct {match.court}
            </span>
          ) : (
            <span className="text-xs text-slate-700">—</span>
          )}
        </div>

        {/* Match info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white truncate">
            {aName}
            <span className="mx-2 text-slate-600">vs</span>
            {bName}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            {match.tc?.name ?? ''}{match.round_name ? ` · ${match.round_name}` : ''}
            {match.group_name ? ` · ${match.group_name}` : ''}
          </p>
        </div>

        {/* Score */}
        {scoreStr && (
          <span className="text-xs font-mono text-slate-400 shrink-0">{scoreStr}</span>
        )}

        {/* Status */}
        <span className={`shrink-0 text-xs ${STATUS_STYLE[match.status] ?? 'text-slate-500'}`}>
          {STATUS_LABEL[match.status] ?? match.status}
        </span>

        <span className="text-slate-500 shrink-0">›</span>
      </Link>
    );
  }

  return (
    <div className="min-h-screen bg-surface">
      <AppNav />

      <main className="mx-auto max-w-3xl px-6 py-10">
        {/* Breadcrumb */}
        <nav className="mb-6 flex items-center gap-2 text-sm text-slate-500">
          <Link href={`/tournaments/${tournamentId}`} className="hover:text-slate-300 transition-colors">
            {t.name}
          </Link>
          <span>/</span>
          <span className="text-slate-400">Scoring</span>
        </nav>

        <h1 className="mb-8 text-2xl font-bold text-white">Match scoring</h1>

        {/* Live */}
        {live.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-accent-400">
              Live now — {live.length} match{live.length !== 1 ? 'es' : ''}
            </h2>
            <div className="space-y-2">
              {live.map((m) => <MatchRow key={m.id} match={m} />)}
            </div>
          </section>
        )}

        {/* Scheduled */}
        {scheduled.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
              Upcoming — {scheduled.length}
            </h2>
            <div className="space-y-2">
              {scheduled.map((m) => <MatchRow key={m.id} match={m} />)}
            </div>
          </section>
        )}

        {/* Done */}
        {done.length > 0 && (
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-600">
              Completed — {done.length}
            </h2>
            <div className="space-y-2">
              {done.map((m) => <MatchRow key={m.id} match={m} />)}
            </div>
          </section>
        )}

        {rows.length === 0 && (
          <div className="rounded-xl bg-surface-card p-10 text-center ring-1 ring-surface-border">
            <p className="text-2xl mb-2">🎾</p>
            <p className="text-sm font-medium text-white mb-1">No matches yet</p>
            <p className="text-xs text-slate-500">
              Generate a draw for at least one category to start scoring.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
