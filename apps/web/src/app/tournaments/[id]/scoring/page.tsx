import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { createClient, createAdminClient, getUserRoles } from '@/lib/supabase/server';
import { AppNav } from '@/components/layout/AppNav';
import { PrintButton } from '@/components/ui/PrintButton';
import { DisputeQueue } from '@/components/scoring/DisputeQueue';
import { CategoryFilter } from '@/components/scoring/CategoryFilter';
import { ScoringHubRealtime } from '@/components/scoring/ScoringHubRealtime';
import { ActiveRefereesProvider } from '@/components/scoring/ActiveRefereesProvider';
import { ScoringMatchList } from '@/components/scoring/ScoringMatchList';
import { RefereePinsSection } from '@/components/scoring/RefereePinsSection';
import type { ScoringMatch } from '@/components/scoring/ScoringMatchList';

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
    .select('id, pin_id, referee_name, last_active_at, matches_scored_count')
    .eq('tournament_id', t.id)
    .eq('is_active', true)
    .order('last_active_at', { ascending: false })) as {
      data: Array<{ id: string; pin_id: string; referee_name: string; last_active_at: string | null; matches_scored_count: number }> | null;
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

  // ── Build serialisable ScoringMatch objects ───────────────────────────────
  function toScoringMatch(m: MatchRow): ScoringMatch {
    return {
      id: m.id,
      status: m.status,
      round: m.round,
      roundLabel: m.round_name ?? `Round ${m.round}`,
      groupName: m.group_name,
      categoryId: m.tc?.id ?? '',
      categoryName: m.tc?.name ?? '',
      playFormat: m.tc?.play_format ?? 'singles',
      court: m.court,
      scheduledTime: m.scheduled_time,
      assignedRefereeName: m.assigned_referee_name,
      pausedForReassignment: m.paused_for_reassignment,
      restartRequested: m.restart_requested,
      restartRequestedReason: m.restart_requested_reason,
      sets: (m.sets as { score_a: number; score_b: number }[]) ?? [],
      playerReportedWinnerId: m.player_reported_winner_id,
      playerA: entryTeamName(m.ea, m.tc?.play_format),
      playerB: entryTeamName(m.eb, m.tc?.play_format),
      entryA: m.ea,
      entryB: m.eb,
    };
  }

  const scoringMatches   = rows.map(toScoringMatch);
  const restartMatches   = allRows.filter((m) => m.restart_requested).map(toScoringMatch);

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

  function formatDate(d: string) {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-AU', {
      weekday: 'short', day: 'numeric', month: 'short',
    });
  }

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
            {restartMatches.length > 0 && (
              <span className="flex items-center gap-1.5 rounded-full bg-red-500/20 px-3 py-1 text-xs font-semibold text-red-400">
                <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
                {restartMatches.length} restart request{restartMatches.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>

        {/* Referee slots (always visible) + collapsible PIN management */}
        <div className="mb-6" data-print-hide>
          <RefereePinsSection
            tournamentId={t.id}
            pins={(refPins ?? []).map((p) => ({
              id: p.id as string,
              label: p.label as string | null,
              expires_at: p.expires_at as string,
              is_revoked: p.is_revoked as boolean,
            }))}
            initialSessions={activeReferees}
          />
        </div>

        {/* Category filter — below referee section */}
        {categories.length > 1 && (
          <div className="mb-5">
            <CategoryFilter categories={categories} activeCategoryId={categoryFilter ?? null} />
          </div>
        )}

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

        {/* Match list with search + filter (client component) */}
        <ScoringMatchList
          matches={scoringMatches}
          restartMatches={restartMatches}
          tournamentSlug={slug}
          maxCourts={maxCourts}
          activeReferees={activeReferees}
        />
      </main>
      </ActiveRefereesProvider>
    </div>
  );
}
