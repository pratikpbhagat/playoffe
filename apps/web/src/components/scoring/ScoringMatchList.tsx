'use client';

import { useState, useMemo, memo } from 'react';
import Link from 'next/link';
import { LiveScoreDisplay } from './LiveScoreDisplay';
import { RestartApproveButton } from './RestartApproveButton';
import { ScheduledMatchCard } from './ScheduledMatchCard';

// ── Serialisable match shape (pre-computed on the server) ─────────────────────

export interface ScoringMatchEntry {
  id: string;
  seed: number | null;
  players: { full_name: string } | null;
  partner: { full_name: string } | null;
}

export interface ScoringMatch {
  id: string;
  status: string;
  round: number;
  roundLabel: string;
  groupName: string | null;
  categoryId: string;
  categoryName: string;
  playFormat: string;
  court: number | null;
  scheduledTime: string | null;
  assignedRefereeName: string | null;
  pausedForReassignment: boolean;
  restartRequested: boolean;
  restartRequestedReason: string | null;
  sets: { score_a: number; score_b: number }[];
  playerReportedWinnerId: string | null;
  /** Pre-computed display name ("Alice Smith" or "Alice / Bob") */
  playerA: string;
  playerB: string;
  /** Raw entry data for ScheduledMatchCard (needs seed + full_name) */
  entryA: ScoringMatchEntry | null;
  entryB: ScoringMatchEntry | null;
}

export interface ActiveReferee {
  id: string;
  pin_id: string;
  referee_name: string;
  last_active_at: string | null;
  matches_scored_count: number;
}

interface Props {
  /** Date + category filtered matches (the "visible" set) */
  matches: ScoringMatch[];
  /** Restart-requested matches — shown globally, not date-filtered */
  restartMatches: ScoringMatch[];
  tournamentSlug: string;
  maxCourts: number;
  activeReferees: ActiveReferee[];
}

// ── Status filter options ─────────────────────────────────────────────────────
const STATUS_OPTS = [
  { value: '',           label: 'All' },
  { value: 'live',       label: 'Live' },
  { value: 'paused',     label: 'Paused' },
  { value: 'scheduled',  label: 'Scheduled' },
  { value: 'completed',  label: 'Completed' },
] as const;

// ── Main component ────────────────────────────────────────────────────────────

export const ScoringMatchList = memo(function ScoringMatchList({
  matches,
  restartMatches,
  tournamentSlug,
  maxCourts,
  activeReferees,
}: Props) {
  const [search,       setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [courtFilter,  setCourtFilter]  = useState('');

  // Unique courts from the visible match set (sorted numerically)
  const availableCourts = useMemo(() => {
    const courts = new Set<number>();
    for (const m of matches) if (m.court != null) courts.add(m.court);
    return [...courts].sort((a, b) => a - b);
  }, [matches]);

  // ── Filter logic ──────────────────────────────────────────────────────────
  const q = search.trim().toLowerCase();

  function matchesSearch(m: ScoringMatch) {
    if (!q) return true;
    return (
      m.playerA.toLowerCase().includes(q) ||
      m.playerB.toLowerCase().includes(q) ||
      m.categoryName.toLowerCase().includes(q)
    );
  }

  function matchesStatus(m: ScoringMatch) {
    if (!statusFilter) return true;
    if (statusFilter === 'live')      return m.status === 'in_progress' && !m.pausedForReassignment;
    if (statusFilter === 'paused')    return m.status === 'in_progress' && m.pausedForReassignment;
    if (statusFilter === 'scheduled') return m.status === 'scheduled';
    if (statusFilter === 'completed') return m.status === 'completed' || m.status === 'walkover';
    return true;
  }

  function matchesCourt(m: ScoringMatch) {
    if (!courtFilter) return true;
    return String(m.court) === courtFilter;
  }

  function applyFilters(list: ScoringMatch[]) {
    return list.filter((m) => matchesSearch(m) && matchesStatus(m) && matchesCourt(m));
  }

  const isFiltered = !!(q || statusFilter || courtFilter);

  // ── Filtered sections ─────────────────────────────────────────────────────
  const { liveActive, livePaused, assignedNotStarted, upcoming, done } = useMemo(() => {
    const filtered = applyFilters(matches);
    return {
      liveActive: filtered.filter((m) => m.status === 'in_progress' && !m.pausedForReassignment),
      livePaused: filtered.filter((m) => m.status === 'in_progress' && m.pausedForReassignment),
      assignedNotStarted: filtered.filter((m) => m.status === 'scheduled' && !!m.court && !!m.assignedRefereeName),
      upcoming: filtered.filter((m) => m.status === 'scheduled' && (!m.court || !m.assignedRefereeName)),
      done: filtered.filter((m) => m.status === 'completed' || m.status === 'walkover'),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches, q, statusFilter, courtFilter]);

  // Restart requests: apply only search filter (they're global, not date-filtered)
  const filteredRestarts = useMemo(
    () => restartMatches.filter((m) =>
      !q || m.playerA.toLowerCase().includes(q) || m.playerB.toLowerCase().includes(q) || m.categoryName.toLowerCase().includes(q),
    ),
    [restartMatches, q],
  );

  const totalVisible =
    filteredRestarts.length + liveActive.length + livePaused.length +
    assignedNotStarted.length + upcoming.length + done.length;

  const hasActiveFilters = isFiltered && totalVisible === 0;

  return (
    <div>
      {/* ── Search + filter bar ─────────────────────────────────────────── */}
      <div className="mb-6 flex flex-wrap gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-[180px]">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">🔍</span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search player or category…"
            className="w-full rounded-lg border border-slate-600 bg-surface-card pl-9 pr-9 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
            >
              ✕
            </button>
          )}
        </div>

        {/* Status filter */}
        <div className="flex items-center gap-1 rounded-lg border border-slate-600 bg-surface-card px-2 py-1">
          {STATUS_OPTS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setStatusFilter(statusFilter === opt.value ? '' : opt.value)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                statusFilter === opt.value
                  ? 'bg-brand-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Court filter — only shown when courts exist */}
        {availableCourts.length > 0 && (
          <div className="relative">
            <select
              value={courtFilter}
              onChange={(e) => setCourtFilter(e.target.value)}
              className="appearance-none rounded-lg border border-slate-600 bg-surface-card pl-3 pr-8 py-2 text-sm text-white outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 cursor-pointer"
            >
              <option value="">All courts</option>
              {availableCourts.map((c) => (
                <option key={c} value={String(c)}>Court {c}</option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">▾</span>
          </div>
        )}

        {/* Clear all filters */}
        {isFiltered && (
          <button
            onClick={() => { setSearch(''); setStatusFilter(''); setCourtFilter(''); }}
            className="rounded-lg border border-slate-600 px-3 py-2 text-xs text-slate-400 hover:text-white hover:border-slate-400 transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Active filter summary */}
      {isFiltered && totalVisible > 0 && (
        <p className="mb-4 text-xs text-slate-500">
          Showing <span className="text-white font-medium">{totalVisible}</span> match{totalVisible !== 1 ? 'es' : ''}
          {q ? <> matching <span className="text-brand-300">"{search}"</span></> : null}
        </p>
      )}

      {/* ── 0. Restart requests ──────────────────────────────────────────── */}
      {filteredRestarts.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-red-400">
            ↺ Restart requests — {filteredRestarts.length}
          </h2>
          <p className="mb-3 text-[11px] text-slate-600">
            Referee accidentally ended a match. Approve to reset it to the upcoming queue.
          </p>
          <div className="space-y-3">
            {filteredRestarts.map((m) => <CompletedMatchCard key={m.id} match={m} tournamentSlug={tournamentSlug} />)}
          </div>
        </section>
      )}

      {/* ── 1. Live now ──────────────────────────────────────────────────── */}
      {liveActive.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-accent-400">
            Live now — {liveActive.length} match{liveActive.length !== 1 ? 'es' : ''}
          </h2>
          <p className="mb-3 text-[11px] text-slate-600">
            Referee is scoring. Re-assignment available only after the referee pauses the match.
          </p>
          <div className="space-y-2">
            {liveActive.map((m) => <LiveMatchCard key={m.id} match={m} tournamentSlug={tournamentSlug} />)}
          </div>
        </section>
      )}

      {/* ── 2. Paused ────────────────────────────────────────────────────── */}
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
                tournamentSlug={tournamentSlug}
                status="in_progress"
                pausedForReassignment
                initialSets={m.sets}
                categoryName={m.categoryName}
                roundLabel={m.roundLabel}
                groupName={m.groupName}
                scheduledTime={m.scheduledTime}
                court={m.court}
                assignedRefereeName={m.assignedRefereeName}
                maxCourts={maxCourts}
                entryA={m.entryA}
                entryB={m.entryB}
                playFormat={m.playFormat}
                activeReferees={activeReferees}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── 3. Scheduled — assigned ──────────────────────────────────────── */}
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
                tournamentSlug={tournamentSlug}
                status="scheduled"
                pausedForReassignment={false}
                categoryName={m.categoryName}
                roundLabel={m.roundLabel}
                groupName={m.groupName}
                scheduledTime={m.scheduledTime}
                court={m.court}
                assignedRefereeName={m.assignedRefereeName}
                maxCourts={maxCourts}
                entryA={m.entryA}
                entryB={m.entryB}
                playFormat={m.playFormat}
                activeReferees={activeReferees}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── 4. Upcoming — unassigned ─────────────────────────────────────── */}
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
                tournamentSlug={tournamentSlug}
                status="scheduled"
                pausedForReassignment={false}
                categoryName={m.categoryName}
                roundLabel={m.roundLabel}
                groupName={m.groupName}
                scheduledTime={m.scheduledTime}
                court={m.court}
                assignedRefereeName={m.assignedRefereeName}
                maxCourts={maxCourts}
                entryA={m.entryA}
                entryB={m.entryB}
                playFormat={m.playFormat}
                activeReferees={activeReferees}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── 5. Completed ─────────────────────────────────────────────────── */}
      {done.length > 0 && (
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
            Completed — {done.length}
          </h2>
          <div className="space-y-2">
            {done.map((m) => <CompletedMatchCard key={m.id} match={m} tournamentSlug={tournamentSlug} />)}
          </div>
        </section>
      )}

      {/* Empty state */}
      {totalVisible === 0 && (
        <div className="rounded-xl bg-surface-card p-10 text-center ring-1 ring-surface-border">
          <p className="text-2xl mb-2">{hasActiveFilters ? '🔍' : '🎾'}</p>
          <p className="text-sm font-medium text-white mb-1">
            {hasActiveFilters ? 'No matches match your filters' : 'No matches yet'}
          </p>
          <p className="text-xs text-slate-500">
            {hasActiveFilters
              ? 'Try clearing the search or changing the filter.'
              : 'Generate a draw for at least one category to start scoring.'}
          </p>
          {hasActiveFilters && (
            <button
              onClick={() => { setSearch(''); setStatusFilter(''); setCourtFilter(''); }}
              className="mt-4 rounded-lg border border-slate-600 px-4 py-1.5 text-xs text-slate-400 hover:text-white hover:border-slate-400 transition-colors"
            >
              Clear all filters
            </button>
          )}
        </div>
      )}
    </div>
  );
});

// ── Internal card components ──────────────────────────────────────────────────

function LiveMatchCard({ match, tournamentSlug }: { match: ScoringMatch; tournamentSlug: string }) {
  return (
    <Link
      href={`/tournaments/${tournamentSlug}/scoring/${match.id}`}
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
        {/* Mobile: stacked names */}
        <div className="sm:hidden">
          <p className="text-sm font-semibold text-white truncate">{match.playerA}</p>
          <p className="text-[11px] text-slate-500 font-normal my-0.5">vs</p>
          <p className="text-sm font-semibold text-white truncate">{match.playerB}</p>
        </div>
        {/* Desktop: single line */}
        <p className="hidden sm:block text-sm font-semibold text-white truncate">
          {match.playerA}
          <span className="mx-2 text-slate-500 font-normal">vs</span>
          {match.playerB}
        </p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <p className="text-xs text-slate-500 truncate">
            {match.categoryName}
            {match.roundLabel ? ` · ${match.roundLabel}` : ''}
            {match.groupName ? ` · ${match.groupName}` : ''}
          </p>
          {match.assignedRefereeName && (
            <span className="text-[11px] text-slate-600">
              Ref: <span className="text-slate-500">{match.assignedRefereeName}</span>
            </span>
          )}
        </div>
      </div>

      <LiveScoreDisplay
        matchId={match.id}
        initialSets={match.sets}
        className="text-sm font-mono font-bold text-accent-300 shrink-0"
        emptyLabel="—"
      />

      <span className="hidden sm:block text-slate-600 shrink-0">›</span>
    </Link>
  );
}

function CompletedMatchCard({ match, tournamentSlug }: { match: ScoringMatch; tournamentSlug: string }) {
  const sets = match.sets ?? [];
  const scoreStr = sets.length > 0 ? sets.map((s) => `${s.score_a}-${s.score_b}`).join(', ') : null;
  const needsRestart = match.restartRequested;

  return (
    <div className={`rounded-xl ring-1 overflow-hidden ${
      needsRestart ? 'bg-red-950/20 ring-red-800/40' : 'bg-surface-card ring-surface-border'
    }`}>
      {needsRestart && (
        <div className="flex items-center gap-2 border-b border-red-800/30 bg-red-900/20 px-5 py-2">
          <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse shrink-0" />
          <p className="text-xs font-semibold text-red-400">↺ Referee requested restart</p>
        </div>
      )}

      <Link
        href={`/tournaments/${tournamentSlug}/scoring/${match.id}`}
        className="flex items-center gap-4 px-5 py-3.5 hover:bg-white/[0.02] transition-colors"
      >
        <div className="w-14 shrink-0 text-center">
          {match.court && (
            <span className="rounded bg-surface px-2 py-0.5 text-[11px] font-mono text-slate-500">
              Ct {match.court}
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          {/* Mobile: stacked names */}
          <div className="sm:hidden">
            <p className={`text-sm font-medium truncate ${needsRestart ? 'text-white' : 'text-slate-300'}`}>{match.playerA}</p>
            <p className="text-[11px] text-slate-500 font-normal my-0.5">vs</p>
            <p className={`text-sm font-medium truncate ${needsRestart ? 'text-white' : 'text-slate-300'}`}>{match.playerB}</p>
          </div>
          {/* Desktop: single line */}
          <p className={`hidden sm:block text-sm font-medium truncate ${needsRestart ? 'text-white' : 'text-slate-300'}`}>
            {match.playerA}
            <span className="mx-2 text-slate-500 font-normal">vs</span>
            {match.playerB}
          </p>
          <p className="text-xs text-slate-500 mt-0.5 truncate">
            {match.categoryName}
            {match.roundLabel ? ` · ${match.roundLabel}` : ''}
            {match.groupName ? ` · ${match.groupName}` : ''}
          </p>
        </div>
        {scoreStr && (
          <span className="text-xs font-mono font-semibold text-slate-400 shrink-0">{scoreStr}</span>
        )}
        <span className="shrink-0 text-xs font-medium text-slate-500">
          {match.status === 'walkover' ? 'W/O' : 'Done'}
        </span>
        <span className="hidden sm:block text-slate-600 shrink-0">›</span>
      </Link>

      {needsRestart && (
        <div className="border-t border-red-800/20 px-5 py-3">
          <RestartApproveButton
            matchId={match.id}
            restartReason={match.restartRequestedReason}
          />
        </div>
      )}
    </div>
  );
}
