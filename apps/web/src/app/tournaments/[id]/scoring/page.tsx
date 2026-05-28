import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { createClient, createAdminClient, getUserRoles } from '@/lib/supabase/server';
import { AppNav } from '@/components/layout/AppNav';
import { RefereePinsPanel } from '@/components/tournaments/RefereePinsPanel';
import { PrintButton } from '@/components/ui/PrintButton';
import { DisputeQueue } from '@/components/scoring/DisputeQueue';
import { ScheduledMatchCard } from '@/components/scoring/ScheduledMatchCard';
import { CategoryFilter } from '@/components/scoring/CategoryFilter';
import { RestartApproveButton } from '@/components/scoring/RestartApproveButton';
import { LiveScoreDisplay } from '@/components/scoring/LiveScoreDisplay';
import { ScoringHubRealtime } from '@/components/scoring/ScoringHubRealtime';
import { ActiveRefereesProvider } from '@/components/scoring/ActiveRefereesProvider';
import { ActiveRefereesStrip } from '@/components/scoring/ActiveRefereesStrip';

export const metadata: Metadata = { title: 'Scoring' };

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ date?: string; category?: string }>;
}

export default async function ScoringHubPage({ params, searchParams }: Props) {
  const { id: slug } = await params;
  const { date: dateFilter, category: categoryFilter } = await searchParams;

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

  const maxCourts = (t.court_count as number | null) ?? 10;

  // Referee PINs
  const { data: refPins } = await admin
    .from('tournament_referee_pins')
    .select('id, label, expires_at, is_revoked')
    .eq('tournament_id', t.id)
    .order('created_at', { ascending: false });

  // Active referee sessions (for the "who's online" strip)
  const { data: refSessions } = await (admin
    .from('referee_sessions' as any)
    .select('id, referee_name, last_active_at, matches_scored_count')
    .eq('tournament_id', t.id)
    .eq('is_active', true)
    .order('last_active_at', { ascending: false })) as {
      data: Array<{ id: string; referee_name: string; last_active_at: string | null; matches_scored_count: number }> | null;
    };

  // Build the assignable referee list from active PIN labels.
  // PIN labels are what the admin created and named — they're also what referees
  // see as their identity when they check in (startRefereeSessionAction uses
  // the PIN label as referee_name). This makes assignment and filtering consistent.
  const now = new Date().toISOString();
  const assignableReferees = (refPins ?? [])
    .filter((p) => !(p.is_revoked as boolean) && (p.expires_at as string) > now)
    .map((p) => ({
      id: p.id as string,
      referee_name: ((p.label as string | null) ?? 'Referee').trim() || 'Referee',
    }));

  // Keep activeReferees (sessions) for the RefereePinsPanel sessions section
  const activeReferees = refSessions ?? [];

  const { data: matches } = await admin
    .from('matches')
    .select(`
      id, round, round_name, group_name, status, court, scheduled_time, sets,
      assigned_referee_name, paused_for_reassignment,
      restart_requested, restart_requested_reason,
      player_reported_winner_id, player_reported_sets,
      ea:tournament_entries!entry_a_id(id, seed, players!player_id(full_name), partner:players!partner_id(full_name)),
      eb:tournament_entries!entry_b_id(id, seed, players!player_id(full_name), partner:players!partner_id(full_name)),
      tc:tournament_categories!category_id(id, name, play_format)
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
    assigned_referee_name: string | null;
    paused_for_reassignment: boolean;
    restart_requested: boolean;
    restart_requested_reason: string | null;
    sets: { set_number: number; score_a: number; score_b: number }[];
    player_reported_winner_id: string | null;
    player_reported_sets: unknown;
    ea: { id: string; seed: number | null; players: { full_name: string } | null; partner: { full_name: string } | null } | null;
    eb: { id: string; seed: number | null; players: { full_name: string } | null; partner: { full_name: string } | null } | null;
    tc: { id: string; name: string; play_format: string } | null;
  };

  const allRows = (matches ?? []) as unknown as MatchRow[];

  // ── Extract unique categories ─────────────────────────────────────────────
  const categoryMap = new Map<string, string>();
  for (const m of allRows) {
    if (m.tc?.id && m.tc?.name) categoryMap.set(m.tc.id, m.tc.name);
  }
  const categories = [...categoryMap.entries()].map(([id, name]) => ({ id, name }));

  // ── Category filter ───────────────────────────────────────────────────────
  const filteredByCategory = categoryFilter
    ? allRows.filter((m) => m.tc?.id === categoryFilter)
    : allRows;

  // ── Multi-day grouping ────────────────────────────────────────────────────
  const allDates = [...new Set(
    filteredByCategory
      .filter((m) => m.scheduled_time)
      .map((m) => m.scheduled_time!.slice(0, 10)),
  )].sort();

  const isMultiDay = allDates.length > 1;
  const activeDate = isMultiDay ? (dateFilter ?? allDates[0] ?? null) : null;

  const rows = activeDate
    ? filteredByCategory.filter((m) => {
        if (!m.scheduled_time) return m.status === 'in_progress';
        return m.scheduled_time.slice(0, 10) === activeDate;
      })
    : filteredByCategory;

  // ── Four match sections ───────────────────────────────────────────────────
  // 1. Live Now: referee has started the match and it is NOT paused
  const liveActive = rows.filter(
    (m) => m.status === 'in_progress' && !m.paused_for_reassignment,
  );

  // 2. Live but paused: referee sent back for re-assignment → admin must re-assign
  const livePaused = rows.filter(
    (m) => m.status === 'in_progress' && m.paused_for_reassignment,
  );

  // 3. Scheduled (assigned): court AND referee set but match hasn't started yet
  const assignedNotStarted = rows.filter(
    (m) => m.status === 'scheduled' && !!m.court && !!m.assigned_referee_name,
  );

  // 4. Upcoming (unassigned): no court or referee yet
  const upcoming = rows.filter(
    (m) => m.status === 'scheduled' && (!m.court || !m.assigned_referee_name),
  );

  // 5. Completed
  const done = rows.filter(
    (m) => m.status === 'completed' || m.status === 'walkover',
  );

  // Matches awaiting admin-approved restart (subset of done, globally — not date-filtered)
  const restartRequests = allRows.filter((m) => m.restart_requested);

  // Player-reported matches pending review (all categories, no date filter)
  const pendingReport = allRows.filter(
    (m) => m.player_reported_winner_id && m.status !== 'completed' && m.status !== 'walkover',
  );

  function entryTeamName(entry: MatchRow['ea'], playFormat?: string | null): string {
    if (!entry?.players) return 'TBD';
    const isDoubles = playFormat === 'doubles' || playFormat === 'mixed_doubles';
    if (isDoubles && entry.partner) return `${entry.players.full_name} / ${entry.partner.full_name}`;
    return entry.players.full_name;
  }

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
    return {
      id: m.id,
      tournamentSlug: slug,
      categoryName: m.tc?.name ?? '',
      roundLabel: m.round_name ?? `Round ${m.round}`,
      playerA: aName,
      playerB: bName,
      reportedWinnerName,
      reportedSets: reportedSetsArr.map((s) => `${s.score_a}-${s.score_b}`).join(', '),
    };
  });

  // Read-only card for active live matches (no controls — referee is scoring).
  // LiveScoreDisplay subscribes to Supabase Realtime so the score updates as
  // the referee auto-saves on their device — no page refresh needed.
  function LiveMatchCard({ match }: { match: MatchRow }) {
    const aName = entryTeamName(match.ea, match.tc?.play_format);
    const bName = entryTeamName(match.eb, match.tc?.play_format);
    const initialSets = (match.sets as { score_a: number; score_b: number }[]) ?? [];

    return (
      <Link
        href={`/tournaments/${slug}/scoring/${match.id}`}
        className="flex items-center gap-4 rounded-xl bg-accent-950/20 px-5 py-4 ring-1 ring-accent-700/40 transition-all hover:ring-accent-500/60"
      >
        <div className="w-14 shrink-0 text-center space-y-1">
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-accent-400">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-400 animate-pulse" />
            LIVE
          </span>
          {match.court && (
            <span className="block rounded bg-surface px-2 py-0.5 text-[11px] font-mono text-slate-500">
              Ct {match.court}
            </span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">
            {aName}<span className="mx-2 text-slate-500 font-normal">vs</span>{bName}
          </p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <p className="text-xs text-slate-500 truncate">
              {match.tc?.name ?? ''}
              {match.round_name ? ` · ${match.round_name}` : ''}
              {match.group_name ? ` · ${match.group_name}` : ''}
            </p>
            {match.assigned_referee_name && (
              <span className="text-[11px] text-slate-600">
                Ref: <span className="text-slate-500">{match.assigned_referee_name}</span>
              </span>
            )}
          </div>
        </div>

        {/* Score updates in real-time as referee auto-saves */}
        <LiveScoreDisplay
          matchId={match.id}
          initialSets={initialSets}
          className="text-sm font-mono font-bold text-accent-300 shrink-0"
          emptyLabel="—"
        />

        <span className="text-slate-600 shrink-0">›</span>
      </Link>
    );
  }

  function CompletedMatchCard({ match }: { match: MatchRow }) {
    const aName = entryTeamName(match.ea, match.tc?.play_format);
    const bName = entryTeamName(match.eb, match.tc?.play_format);
    const sets = match.sets as { score_a: number; score_b: number }[] ?? [];
    const scoreStr = sets.length > 0 ? sets.map((s) => `${s.score_a}-${s.score_b}`).join(', ') : null;
    const needsRestart = match.restart_requested;

    return (
      <div className={`rounded-xl ring-1 overflow-hidden ${
        needsRestart ? 'bg-red-950/20 ring-red-800/40' : 'bg-surface-card ring-surface-border'
      }`}>
        {/* Restart-requested banner */}
        {needsRestart && (
          <div className="flex items-center gap-2 border-b border-red-800/30 bg-red-900/20 px-5 py-2">
            <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse shrink-0" />
            <p className="text-xs font-semibold text-red-400">
              ↺ Referee requested restart
            </p>
          </div>
        )}

        <Link
          href={`/tournaments/${slug}/scoring/${match.id}`}
          className="flex items-center gap-4 px-5 py-3.5 hover:bg-white/[0.02] transition-colors"
        >
          <div className="w-14 shrink-0 text-center">
            {match.court && (
              <span className="rounded bg-surface px-2 py-0.5 text-[11px] font-mono text-slate-700">
                Ct {match.court}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-sm truncate ${needsRestart ? 'text-slate-300' : 'text-slate-500'}`}>
              {aName}<span className="mx-2 text-slate-700">vs</span>{bName}
            </p>
            <p className="text-xs text-slate-600 mt-0.5 truncate">
              {match.tc?.name ?? ''}{match.round_name ? ` · ${match.round_name}` : ''}
              {match.group_name ? ` · ${match.group_name}` : ''}
            </p>
          </div>
          {scoreStr && <span className="text-xs font-mono text-slate-700 shrink-0">{scoreStr}</span>}
          <span className="shrink-0 text-xs text-slate-700">
            {match.status === 'walkover' ? 'W/O' : 'Done'}
          </span>
          <span className="text-slate-800 shrink-0">›</span>
        </Link>

        {/* Approve restart controls */}
        {needsRestart && (
          <div className="border-t border-red-800/20 px-5 py-3">
            <RestartApproveButton
              matchId={match.id}
              restartReason={match.restart_requested_reason}
            />
          </div>
        )}
      </div>
    );
  }

  function formatDate(d: string) {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-AU', {
      weekday: 'short', day: 'numeric', month: 'short',
    });
  }

  const totalVisible = restartRequests.length + liveActive.length + livePaused.length + assignedNotStarted.length + upcoming.length + done.length;

  return (
    <div className="min-h-screen bg-surface">
      <AppNav />

      <ActiveRefereesProvider tournamentId={t.id} initialReferees={assignableReferees}>
      <main className="mx-auto max-w-3xl px-6 py-10">
        {/* Auto-refreshes the page when referee pause/restart/status events arrive */}
        <ScoringHubRealtime tournamentId={t.id} />

        {/* Breadcrumb */}
        <nav className="mb-6 flex items-center gap-2 text-sm text-slate-500">
          <Link href={`/tournaments/${slug}`} className="hover:text-slate-300 transition-colors">
            {t.name}
          </Link>
          <span>/</span>
          <span className="text-slate-400">Scoring</span>
        </nav>

        {/* Page header */}
        <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-2xl font-bold text-white">Match scoring</h1>
          <div className="flex items-center gap-3">
            <PrintButton label="Print schedule" />
            {pendingReport.length > 0 && (
              <span className="flex items-center gap-1.5 rounded-full bg-amber-500/20 px-3 py-1 text-xs font-semibold text-amber-400">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                {pendingReport.length} report{pendingReport.length !== 1 ? 's' : ''} pending
              </span>
            )}
            {restartRequests.length > 0 && (
              <span className="flex items-center gap-1.5 rounded-full bg-red-500/20 px-3 py-1 text-xs font-semibold text-red-400">
                <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
                {restartRequests.length} restart request{restartRequests.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>

        {/* Category filter */}
        {categories.length > 1 && (
          <div className="mb-5">
            <CategoryFilter categories={categories} activeCategoryId={categoryFilter ?? null} />
          </div>
        )}

        {/* Referee slots strip — shows active PINs (assignable referees) */}
        <div className="mb-6 rounded-xl bg-surface-card ring-1 ring-surface-border px-5 py-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex-1">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
                Referee slots
              </p>
              <ActiveRefereesStrip />
            </div>
            <a href="#referee-pins" className="text-xs text-brand-400 hover:text-brand-300 transition-colors shrink-0">
              Manage PINs ↓
            </a>
          </div>
        </div>

        {/* Multi-day date picker */}
        {isMultiDay && (
          <div className="mb-6 flex flex-wrap gap-2">
            {allDates.map((d) => (
              <Link
                key={d}
                href={`/tournaments/${slug}/scoring?${categoryFilter ? `category=${categoryFilter}&` : ''}date=${d}`}
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
              href={`/tournaments/${slug}/scoring${categoryFilter ? `?category=${categoryFilter}` : ''}`}
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

        {/* Dispute queue */}
        <DisputeQueue matches={disputeMatches} tournamentSlug={slug} />

        {/* ── 0. Restart requests (global — any category, any day) ─────────── */}
        {restartRequests.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-red-400">
              ↺ Restart requests — {restartRequests.length}
            </h2>
            <p className="mb-3 text-[11px] text-slate-600">
              Referee accidentally ended a match. Approve to reset it to the upcoming queue.
            </p>
            <div className="space-y-3">
              {restartRequests.map((m) => <CompletedMatchCard key={m.id} match={m} />)}
            </div>
          </section>
        )}

        {/* ── 1. Live Now (active, not paused) ─────────────────────────────── */}
        {liveActive.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-accent-400">
              Live now — {liveActive.length} match{liveActive.length !== 1 ? 'es' : ''}
            </h2>
            <p className="mb-3 text-[11px] text-slate-600">
              Referee is scoring. Re-assignment available only after the referee pauses the match.
            </p>
            <div className="space-y-2">
              {liveActive.map((m) => <LiveMatchCard key={m.id} match={m} />)}
            </div>
          </section>
        )}

        {/* ── 2. Live but paused (referee requested re-assignment) ─────────── */}
        {livePaused.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-amber-500">
              ⏸ Paused — {livePaused.length} awaiting re-assignment
            </h2>
            <div className="space-y-3">
              {livePaused.map((m) => (
                <ScheduledMatchCard
                  key={m.id}
                  matchId={m.id}
                  tournamentSlug={slug}
                  status="in_progress"
                  pausedForReassignment={true}
                  initialSets={(m.sets as { score_a: number; score_b: number }[]) ?? []}
                  categoryName={m.tc?.name ?? ''}
                  roundLabel={m.round_name ?? `Round ${m.round}`}
                  groupName={m.group_name}
                  scheduledTime={m.scheduled_time}
                  court={m.court}
                  assignedRefereeName={m.assigned_referee_name}
                  maxCourts={maxCourts}
                  entryA={m.ea}
                  entryB={m.eb}
                  playFormat={m.tc?.play_format ?? 'singles'}
                  activeReferees={activeReferees}
                />
              ))}
            </div>
          </section>
        )}

        {/* ── 3. Scheduled — assigned (court + referee set, not started) ────── */}
        {assignedNotStarted.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-brand-400">
              Scheduled — {assignedNotStarted.length} assigned
            </h2>
            <p className="mb-3 text-[11px] text-slate-600">
              Court and referee assigned. Open the match to start it.
            </p>
            <div className="space-y-3">
              {assignedNotStarted.map((m) => (
                <ScheduledMatchCard
                  key={m.id}
                  matchId={m.id}
                  tournamentSlug={slug}
                  status="scheduled"
                  pausedForReassignment={false}
                  categoryName={m.tc?.name ?? ''}
                  roundLabel={m.round_name ?? `Round ${m.round}`}
                  groupName={m.group_name}
                  scheduledTime={m.scheduled_time}
                  court={m.court}
                  assignedRefereeName={m.assigned_referee_name}
                  maxCourts={maxCourts}
                  entryA={m.ea}
                  entryB={m.eb}
                  playFormat={m.tc?.play_format ?? 'singles'}
                  activeReferees={activeReferees}
                />
              ))}
            </div>
          </section>
        )}

        {/* ── 4. Upcoming — unassigned ──────────────────────────────────────── */}
        {upcoming.length > 0 && (
          <section className="mb-8">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                Upcoming — {upcoming.length} unassigned
              </h2>
              {activeReferees.length === 0 && (
                <span className="text-[11px] text-slate-600">No referees online — type a name</span>
              )}
            </div>
            <div className="space-y-3">
              {upcoming.map((m) => (
                <ScheduledMatchCard
                  key={m.id}
                  matchId={m.id}
                  tournamentSlug={slug}
                  status="scheduled"
                  pausedForReassignment={false}
                  categoryName={m.tc?.name ?? ''}
                  roundLabel={m.round_name ?? `Round ${m.round}`}
                  groupName={m.group_name}
                  scheduledTime={m.scheduled_time}
                  court={m.court}
                  assignedRefereeName={m.assigned_referee_name}
                  maxCourts={maxCourts}
                  entryA={m.ea}
                  entryB={m.eb}
                  playFormat={m.tc?.play_format ?? 'singles'}
                  activeReferees={activeReferees}
                />
              ))}
            </div>
          </section>
        )}

        {/* ── 5. Completed ─────────────────────────────────────────────────── */}
        {done.length > 0 && (
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-700">
              Completed — {done.length}
            </h2>
            <div className="space-y-2">
              {done.map((m) => <CompletedMatchCard key={m.id} match={m} />)}
            </div>
          </section>
        )}

        {totalVisible === 0 && (
          <div className="rounded-xl bg-surface-card p-10 text-center ring-1 ring-surface-border">
            <p className="text-2xl mb-2">🎾</p>
            <p className="text-sm font-medium text-white mb-1">
              {categoryFilter ? 'No matches in this category yet'
                : activeDate ? `No matches on ${formatDate(activeDate)}`
                : 'No matches yet'}
            </p>
            <p className="text-xs text-slate-500">
              Generate a draw for at least one category to start scoring.
            </p>
          </div>
        )}

        {/* Referee PIN management */}
        <div id="referee-pins" className="mt-10" data-print-hide>
          <RefereePinsPanel
            tournamentId={t.id}
            pins={(refPins ?? []).map((p) => ({
              id: p.id,
              label: p.label as string | null,
              expires_at: p.expires_at as string,
              is_revoked: p.is_revoked as boolean,
            }))}
            initialSessions={activeReferees}
          />
        </div>
      </main>
      </ActiveRefereesProvider>
    </div>
  );
}
