import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { AppNav } from '@/components/layout/AppNav';
import { RefereePinsPanel } from '@/components/tournaments/RefereePinsPanel';
import { PrintButton } from '@/components/ui/PrintButton';
import { DisputeQueue } from '@/components/scoring/DisputeQueue';

export const metadata: Metadata = { title: 'Scoring' };

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ date?: string }>;
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

export default async function ScoringHubPage({ params, searchParams }: Props) {
  const { id: slug } = await params;
  const { date: dateFilter } = await searchParams;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();

  const { data: t } = await admin
    .from('tournaments')
    .select('id, name, club_id, start_date, end_date')
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

  // Referee PINs for this tournament
  const { data: refPins } = await admin
    .from('tournament_referee_pins')
    .select('id, label, expires_at, is_revoked')
    .eq('tournament_id', t.id)
    .order('created_at', { ascending: false });

  const { data: matches } = await admin
    .from('matches')
    .select(`
      id, round, round_name, group_name, status, court, scheduled_time, sets,
      player_reported_winner_id, player_reported_sets,
      ea:tournament_entries!entry_a_id(id, seed, players!player_id(full_name), partner:players!partner_id(full_name)),
      eb:tournament_entries!entry_b_id(id, seed, players!player_id(full_name), partner:players!partner_id(full_name)),
      tc:tournament_categories!category_id(name, play_format)
    `)
    .eq('tournament_id', t.id)
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
    player_reported_winner_id: string | null;
    player_reported_sets: unknown;
    ea: { id: string; seed: number | null; players: { full_name: string } | null; partner: { full_name: string } | null } | null;
    eb: { id: string; seed: number | null; players: { full_name: string } | null; partner: { full_name: string } | null } | null;
    tc: { name: string; play_format: string } | null;
  };

  const rows = (matches ?? []) as unknown as MatchRow[];

  // ── Multi-day grouping ────────────────────────────────────────────────────

  // Collect all unique dates that have matches with scheduled_time
  const allDates = [...new Set(
    rows
      .filter((m) => m.scheduled_time)
      .map((m) => m.scheduled_time!.slice(0, 10)),
  )].sort();

  const isMultiDay = allDates.length > 1;

  // Active date filter (null = show all / single-day tournaments)
  const activeDate = isMultiDay ? (dateFilter ?? allDates[0] ?? null) : null;

  // Filter rows for the selected date
  const filteredRows = activeDate
    ? rows.filter((m) => {
        if (!m.scheduled_time) return m.status === 'in_progress'; // always show live
        return m.scheduled_time.slice(0, 10) === activeDate;
      })
    : rows;

  const live = filteredRows.filter((m) => m.status === 'in_progress');
  const scheduled = filteredRows.filter((m) => m.status === 'scheduled');
  const done = filteredRows.filter((m) => m.status === 'completed' || m.status === 'walkover');

  // Player-reported matches pending review
  const pendingReport = rows.filter(
    (m) =>
      m.player_reported_winner_id &&
      m.status !== 'completed' &&
      m.status !== 'walkover',
  );

  // Shape dispute data for the DisputeQueue component
  const disputeMatches = pendingReport.map((m) => {
    const aName = entryTeamName(m.ea, m.tc?.play_format);
    const bName = entryTeamName(m.eb, m.tc?.play_format);
    const reportedWinnerName =
      m.player_reported_winner_id === m.ea?.id ? aName
      : m.player_reported_winner_id === m.eb?.id ? bName
      : 'Unknown';
    const reportedSetsArr = Array.isArray(m.player_reported_sets)
      ? (m.player_reported_sets as { score_a: number; score_b: number }[])
      : [];
    const reportedSets = reportedSetsArr
      .map((s) => `${s.score_a}-${s.score_b}`)
      .join(', ');
    return {
      id: m.id,
      tournamentSlug: slug,
      categoryName: m.tc?.name ?? '',
      roundLabel: m.round_name ?? `Round ${m.round}`,
      playerA: aName,
      playerB: bName,
      reportedWinnerName,
      reportedSets,
    };
  });

  function entryTeamName(entry: MatchRow['ea'], playFormat?: string | null): string {
    if (!entry?.players) return 'TBD';
    const isDoubles = playFormat === 'doubles' || playFormat === 'mixed_doubles';
    if (isDoubles && entry.partner) return `${entry.players.full_name} / ${entry.partner.full_name}`;
    return entry.players.full_name;
  }

  function MatchCard({ match }: { match: MatchRow }) {
    const aName = entryTeamName(match.ea, match.tc?.play_format);
    const bName = entryTeamName(match.eb, match.tc?.play_format);
    const sets = match.sets as { score_a: number; score_b: number }[] ?? [];
    const scoreStr = sets.length > 0
      ? sets.map((s) => `${s.score_a}-${s.score_b}`).join(', ')
      : null;

    const hasPlayerReport = !!match.player_reported_winner_id &&
      match.status !== 'completed' &&
      match.status !== 'walkover';

    return (
      <Link
        href={`/tournaments/${slug}/scoring/${match.id}`}
        className={`flex items-center gap-4 rounded-xl px-5 py-3.5 ring-1 transition-all hover:ring-brand-500/40 ${
          hasPlayerReport
            ? 'bg-amber-950/30 ring-amber-700/50'
            : 'bg-surface-card ring-surface-border'
        }`}
      >
        <div className="w-16 shrink-0 text-center space-y-0.5">
          {match.scheduled_time && (
            <p className="text-xs font-mono text-slate-400">
              {new Date(match.scheduled_time).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          )}
          {match.court ? (
            <span className="rounded bg-surface px-2 py-0.5 text-xs font-mono text-slate-500">
              Ct {match.court}
            </span>
          ) : !match.scheduled_time ? (
            <span className="text-xs text-slate-700">—</span>
          ) : null}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white truncate">
            {aName}
            <span className="mx-2 text-slate-600">vs</span>
            {bName}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <p className="text-xs text-slate-500">
              {match.tc?.name ?? ''}{match.round_name ? ` · ${match.round_name}` : ''}
              {match.group_name ? ` · ${match.group_name}` : ''}
            </p>
            {hasPlayerReport && (
              <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400">
                Score reported
              </span>
            )}
          </div>
        </div>

        {scoreStr && (
          <span className="text-xs font-mono text-slate-400 shrink-0">{scoreStr}</span>
        )}

        <span className={`shrink-0 text-xs ${STATUS_STYLE[match.status] ?? 'text-slate-500'}`}>
          {STATUS_LABEL[match.status] ?? match.status}
        </span>

        <span className="text-slate-500 shrink-0">›</span>
      </Link>
    );
  }

  function formatDate(d: string) {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-AU', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  }

  return (
    <div className="min-h-screen bg-surface">
      <AppNav />

      <main className="mx-auto max-w-3xl px-6 py-10">
        <nav className="mb-6 flex items-center gap-2 text-sm text-slate-500">
          <Link href={`/tournaments/${slug}`} className="hover:text-slate-300 transition-colors">
            {t.name}
          </Link>
          <span>/</span>
          <span className="text-slate-400">Scoring</span>
        </nav>

        <div className="mb-8 flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-2xl font-bold text-white">Match scoring</h1>
          <PrintButton label="Print schedule" />
          {pendingReport.length > 0 && (
            <span className="flex items-center gap-1.5 rounded-full bg-amber-500/20 px-3 py-1 text-xs font-semibold text-amber-400">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
              {pendingReport.length} player report{pendingReport.length !== 1 ? 's' : ''} pending
            </span>
          )}
        </div>

        {/* Multi-day date picker */}
        {isMultiDay && (
          <div className="mb-6 flex flex-wrap gap-2">
            {allDates.map((d) => (
              <Link
                key={d}
                href={`/tournaments/${slug}/scoring?date=${d}`}
                className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
                  activeDate === d
                    ? 'bg-brand-600 text-white'
                    : 'border border-surface-border text-slate-400 hover:border-slate-500 hover:text-slate-300'
                }`}
              >
                {formatDate(d)}
              </Link>
            ))}
            <Link
              href={`/tournaments/${slug}/scoring`}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
                !dateFilter
                  ? 'bg-brand-600 text-white'
                  : 'border border-surface-border text-slate-400 hover:border-slate-500 hover:text-slate-300'
              }`}
            >
              All days
            </Link>
          </div>
        )}

        {/* Dispute queue — player-reported scores awaiting organiser review */}
        <DisputeQueue matches={disputeMatches} tournamentSlug={slug} />

        {live.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-accent-400">
              Live now — {live.length} match{live.length !== 1 ? 'es' : ''}
            </h2>
            <div className="space-y-2">
              {live.map((m) => <MatchCard key={m.id} match={m} />)}
            </div>
          </section>
        )}

        {scheduled.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
              Upcoming — {scheduled.length}
            </h2>
            <div className="space-y-2">
              {scheduled.map((m) => <MatchCard key={m.id} match={m} />)}
            </div>
          </section>
        )}

        {done.length > 0 && (
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-600">
              Completed — {done.length}
            </h2>
            <div className="space-y-2">
              {done.map((m) => <MatchCard key={m.id} match={m} />)}
            </div>
          </section>
        )}

        {filteredRows.length === 0 && (
          <div className="rounded-xl bg-surface-card p-10 text-center ring-1 ring-surface-border">
            <p className="text-2xl mb-2">🎾</p>
            <p className="text-sm font-medium text-white mb-1">
              {activeDate ? `No matches on ${formatDate(activeDate)}` : 'No matches yet'}
            </p>
            <p className="text-xs text-slate-500">
              {activeDate
                ? 'Select a different day or generate a draw for a category.'
                : 'Generate a draw for at least one category to start scoring.'}
            </p>
          </div>
        )}

        {/* Referee PIN management — hidden when printing */}
        <div data-print-hide>
        <RefereePinsPanel
          tournamentId={t.id}
          pins={(refPins ?? []).map((p) => ({
            id: p.id,
            label: p.label as string | null,
            expires_at: p.expires_at as string,
            is_revoked: p.is_revoked as boolean,
          }))}
        />
        </div>
      </main>
    </div>
  );
}
