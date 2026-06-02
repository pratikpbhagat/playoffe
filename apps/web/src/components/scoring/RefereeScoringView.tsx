'use client';

import { useState, useRef, useCallback, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  scoreMatchAsRefereeAction,
  pauseMatchAsRefereeAction,
  startMatchAsRefereeAction,
  saveScoreAsRefereeAction,
  requestMatchRestartAction,
} from '@/lib/actions/referee';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Entry {
  id: string;
  seed: number | null;
  player_name: string;
  partner_name: string | null;
}

interface Match {
  id: string;
  round: number;
  round_name: string | null;
  group_name: string | null;
  court: number | null;
  status: string;
  sets: { score_a: number; score_b: number }[];
  winner_entry_id: string | null;
  assigned_referee_name: string | null;
  paused_for_reassignment: boolean;
  restart_requested: boolean;
  restart_requested_reason: string | null;
  assigned_at: string | null;
  completed_at: string | null;
  entry_a: Entry | null;
  entry_b: Entry | null;
  /** Points to win a set (from category/tournament config) */
  points_per_set: number;
  /** Lead required to win a set (win-by) */
  win_by: number;
}

type AutoSaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

interface Props {
  matches: Match[];
  completedMatches?: Match[];
  pin: string;
  refereeName: string;
  tournamentId: string;
  tournamentSlug: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function entryLabel(e: Entry | null) {
  if (!e) return 'TBD';
  return e.partner_name ? `${e.player_name} / ${e.partner_name}` : e.player_name;
}

function determineWinnerId(
  sets: { score_a: number; score_b: number }[],
  entryAId: string | null | undefined,
  entryBId: string | null | undefined,
): string | null {
  if (!sets.length) return null;
  const aWins = sets.filter((s) => s.score_a > s.score_b).length;
  const bWins = sets.filter((s) => s.score_b > s.score_a).length;
  if (aWins > bWins) return entryAId ?? null;
  if (bWins > aWins) return entryBId ?? null;
  return null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function RefereeScoringView({ matches, completedMatches = [], pin, refereeName, tournamentId, tournamentSlug: _slug }: Props) {
  const router = useRouter();
  const [isRefreshing, startRefreshTransition] = useTransition();

  // Manual refresh — always reliable regardless of realtime connectivity
  function handleManualRefresh() {
    startRefreshTransition(() => {
      router.refresh();
    });
  }

  // ── Realtime: best-effort auto-refresh when admin assigns a match ──────────
  // Uses postgres_changes filtered by tournament_id. This works when the anon
  // client can reach Supabase Realtime; the manual refresh button is the
  // reliable fallback if the event is missed.
  //
  // We track visible match IDs so we don't refresh on score auto-saves (those
  // matches are already showing — refreshing would reset the scoring panel).
  const visibleMatchIds = useRef<Set<string>>(new Set(matches.map((m) => m.id)));

  // Keep the set current after each router.refresh() re-render
  useEffect(() => {
    visibleMatchIds.current = new Set(matches.map((m) => m.id));
  }, [matches]);

  // Sync locallyPaused with server data after each refresh.
  // router.refresh() re-renders in-place (no unmount), so locallyPaused retains
  // matchIds across refreshes. If the server now includes a previously-paused
  // match (because the admin re-assigned it), remove it from locallyPaused so
  // it becomes visible again.
  useEffect(() => {
    setLocallyPaused((prev) => {
      if (prev.size === 0) return prev;
      const serverIds = new Set(matches.map((m) => m.id));
      const next = new Set([...prev].filter((id) => !serverIds.has(id)));
      return next.size !== prev.size ? next : prev; // avoid re-render if unchanged
    });
  }, [matches]);

  // Keep a stable router ref so the subscription effect doesn't re-run on re-renders
  const routerRef = useRef(router);
  useEffect(() => { routerRef.current = router; });

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`referee-view:${tournamentId}:${refereeName}`)
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        'postgres_changes' as any,
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'matches',
          filter: `tournament_id=eq.${tournamentId}`,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => {
          const n = payload.new;
          if (!n?.id) return;

          const newPaused: boolean = n.paused_for_reassignment ?? false;
          const newReferee: string | null = n.assigned_referee_name ?? null;
          const newStatus: string = n.status ?? '';

          const shouldBeVisible =
            newReferee === refereeName &&
            !newPaused &&
            (newStatus === 'scheduled' || newStatus === 'in_progress');

          if (shouldBeVisible && !visibleMatchIds.current.has(n.id)) {
            routerRef.current.refresh();
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  // Only re-subscribe if the tournament or referee changes (not on every render)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentId, refereeName]);

  // ── Which match is open for scoring ───────────────────────────────────────
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);
  const [editingSets, setEditingSets] = useState<{ score_a: number; score_b: number }[]>([
    { score_a: 0, score_b: 0 },
  ]);
  const [manualWinnerId, setManualWinnerId] = useState<string | null>(null);
  /** Entry ID selected as first server for the currently open match */
  const [servingEntryId, setServingEntryId] = useState<string | null>(null);

  // ── Per-match score cache: persists the last saved score so closed tiles
  //    and paused cards still show it (keyed by matchId)
  const [savedScores, setSavedScores] = useState<Map<string, { score_a: number; score_b: number }[]>>(
    () => new Map(matches.map((m) => [m.id, m.sets.length > 0 ? m.sets : []])),
  );

  // ── Auto-save ─────────────────────────────────────────────────────────────
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout>>();
  const [autoSaveStatus, setAutoSaveStatus] = useState<AutoSaveStatus>('idle');
  const pendingSets = useRef<{ score_a: number; score_b: number }[]>([]);

  // ── Per-action loading ────────────────────────────────────────────────────
  const [startingMatch, setStartingMatch] = useState<string | null>(null);
  const [pausingMatch, setPausingMatch] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // ── Local optimistic overrides ────────────────────────────────────────────
  const [locallyPaused, setLocallyPaused] = useState<Set<string>>(
    new Set(matches.filter((m) => m.paused_for_reassignment).map((m) => m.id)),
  );
  const [locallyStarted, setLocallyStarted] = useState<Set<string>>(new Set());

  // ── Error ─────────────────────────────────────────────────────────────────
  const [error, setError] = useState<string | null>(null);

  // ── Section derivation ────────────────────────────────────────────────────
  // Server already returns only scheduled + in_progress, non-paused matches.
  // Client-side optimistic sets keep the UI consistent while actions are in flight.
  const activeMatches = matches.filter((m) => {
    // Matches the referee explicitly paused this session vanish immediately
    if (locallyPaused.has(m.id)) return false;
    const effectiveStatus = locallyStarted.has(m.id) ? 'in_progress' : m.status;
    return effectiveStatus === 'scheduled' || effectiveStatus === 'in_progress';
  });

  // in_progress matches bubble to the top (server already orders them first,
  // but local starts need to be accounted for too)
  const inProgressMatches = activeMatches.filter((m) =>
    locallyStarted.has(m.id) || m.status === 'in_progress',
  );
  const scheduledMatches = activeMatches.filter(
    (m) => !locallyStarted.has(m.id) && m.status === 'scheduled',
  );

  // ── Score entry helpers ───────────────────────────────────────────────────

  function openMatch(matchId: string, serverSets: { score_a: number; score_b: number }[]) {
    // savedScores may be more up-to-date than the server prop if this session
    // has already auto-saved some scores for this match
    const bestSets = savedScores.get(matchId) ?? serverSets;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    setAutoSaveStatus('idle');
    setManualWinnerId(null);
    setServingEntryId(null); // reset serving selection for new match
    setActiveMatchId(matchId);
    setEditingSets(bestSets.length > 0 ? bestSets : [{ score_a: 0, score_b: 0 }]);
    setError(null);
  }

  function closeMatch() {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    // Persist the current editing state into the local cache so the closed
    // tile continues to show the most recently typed score
    if (activeMatchId) {
      setSavedScores((prev) => new Map([...prev, [activeMatchId, editingSets]]));
    }
    setAutoSaveStatus('idle');
    setActiveMatchId(null);
    setError(null);
  }

  function addSet() {
    setEditingSets((s) => [...s, { score_a: 0, score_b: 0 }]);
  }

  function removeSet(i: number) {
    setEditingSets((s) => s.filter((_, idx) => idx !== i));
  }

  const triggerAutoSave = useCallback(
    (matchId: string, newSets: { score_a: number; score_b: number }[]) => {
      pendingSets.current = newSets;
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
      setAutoSaveStatus('pending');
      autoSaveTimer.current = setTimeout(async () => {
        setAutoSaveStatus('saving');
        const result = await saveScoreAsRefereeAction(matchId, pin, pendingSets.current);
        if (result?.error) {
          setAutoSaveStatus('error');
        } else {
          setAutoSaveStatus('saved');
          // Cache the saved score so the closed tile + paused card reflect it
          setSavedScores((prev) => new Map([...prev, [matchId, pendingSets.current]]));
          setTimeout(() => setAutoSaveStatus('idle'), 2000);
        }
      }, 1500);
    },
    [pin],
  );

  function updateSet(i: number, field: 'score_a' | 'score_b', val: number) {
    const newSets = editingSets.map((s, idx) =>
      idx === i ? { ...s, [field]: Math.max(0, val) } : s,
    );
    setEditingSets(newSets);
    setManualWinnerId(null);
    // Auto-save only for in_progress matches
    if (activeMatchId) {
      const match = matches.find((m) => m.id === activeMatchId);
      const effectiveStatus = locallyStarted.has(activeMatchId) ? 'in_progress' : match?.status;
      if (effectiveStatus === 'in_progress') {
        triggerAutoSave(activeMatchId, newSets);
      }
    }
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  async function handleStart(matchId: string) {
    setStartingMatch(matchId);
    setError(null);
    const result = await startMatchAsRefereeAction(matchId, pin, servingEntryId);
    if (result?.error) {
      setError(result.error);
    } else {
      setLocallyStarted((prev) => new Set([...prev, matchId]));
      // Open the scoring panel immediately
      const match = matches.find((m) => m.id === matchId);
      openMatch(matchId, match?.sets ?? []);
      router.refresh();
    }
    setStartingMatch(null);
  }

  async function handleRequestReassignment(matchId: string) {
    setPausingMatch(matchId);
    setError(null);
    // Cancel pending auto-save before pausing
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    const result = await pauseMatchAsRefereeAction(matchId, pin);
    if (result?.error) {
      setError(result.error);
    } else {
      setLocallyPaused((prev) => new Set([...prev, matchId]));
      // Remove from the visibility tracker so the realtime handler can detect
      // when admin re-assigns this match (alreadyVisible will be false → refresh)
      visibleMatchIds.current.delete(matchId);
      if (activeMatchId === matchId) closeMatch();
    }
    setPausingMatch(null);
  }

  async function handleEndMatch(match: Match) {
    const autoWinnerId = determineWinnerId(editingSets, match.entry_a?.id, match.entry_b?.id);
    const winnerId = manualWinnerId ?? autoWinnerId;
    if (!winnerId) {
      setError('Select a winner before ending the match.');
      return;
    }
    setSubmitting(true);
    setError(null);
    // Cancel auto-save — we're about to submit the final result
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    const result = await scoreMatchAsRefereeAction(match.id, pin, editingSets, winnerId);
    if (result?.error) {
      setError(result.error);
    } else {
      closeMatch();
      router.refresh();
    }
    setSubmitting(false);
  }

  // ── Auto-save status pill ─────────────────────────────────────────────────
  function AutoSavePill() {
    if (autoSaveStatus === 'idle') return null;
    const label =
      autoSaveStatus === 'pending' ? '…'
      : autoSaveStatus === 'saving' ? 'Saving…'
      : autoSaveStatus === 'saved' ? '✓ Saved'
      : '⚠ Save failed';
    const cls =
      autoSaveStatus === 'saved' ? 'text-accent-400'
      : autoSaveStatus === 'error' ? 'text-red-400'
      : 'text-slate-500';
    return <span className={`text-[11px] font-medium ${cls}`}>{label}</span>;
  }

  // ── Score-entry panel (shared across active matches) ──────────────────────
  function ScorePanel({ match }: { match: Match }) {
    const autoWinnerId = determineWinnerId(editingSets, match.entry_a?.id, match.entry_b?.id);
    const effectiveWinnerId = manualWinnerId ?? autoWinnerId;
    const isInProgress =
      locallyStarted.has(match.id) || match.status === 'in_progress';

    const pointsPerSet = match.points_per_set ?? 11;
    const winBy = match.win_by ?? 2;

    return (
      <div className="border-t border-surface-border px-5 pb-5 pt-4 space-y-4">
        {/* Target score indicator */}
        <p className="text-[11px] text-slate-600 text-center">
          First to <span className="text-slate-400 font-semibold">{pointsPerSet}</span> pts · win by {winBy}
        </p>

        {/* Set rows — large +/− touch buttons */}
        <div className="space-y-4">
          {editingSets.map((set, i) => {
            const aLeads = set.score_a - set.score_b;
            const bLeads = set.score_b - set.score_a;
            const aWonSet = set.score_a >= pointsPerSet && aLeads >= winBy;
            const bWonSet = set.score_b >= pointsPerSet && bLeads >= winBy;

            return (
              <div key={i} className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-500">Set {i + 1}</p>
                  {editingSets.length > 1 && (
                    <button
                      onClick={() => removeSet(i)}
                      className="text-[10px] text-slate-600 hover:text-red-400 transition-colors"
                    >
                      ✕
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {/* Team A */}
                  <div className="flex-1 space-y-1">
                    <p className="text-[10px] text-slate-600 text-center truncate">{entryLabel(match.entry_a)}</p>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => updateSet(i, 'score_a', set.score_a - 1)}
                        disabled={set.score_a <= 0}
                        className="h-11 w-11 shrink-0 rounded-xl bg-surface ring-1 ring-surface-border text-slate-400 hover:text-white hover:ring-slate-500 disabled:opacity-25 transition-colors text-xl font-bold"
                      >
                        −
                      </button>
                      <input
                        type="number"
                        min={0}
                        max={99}
                        value={set.score_a}
                        onChange={(e) => updateSet(i, 'score_a', parseInt(e.target.value) || 0)}
                        className={`flex-1 min-w-0 rounded-xl border px-2 py-2.5 text-center text-xl font-bold outline-none transition ${
                          aWonSet ? 'border-accent-500/60 bg-accent-500/10 text-accent-300'
                          : bWonSet ? 'border-red-900/30 bg-red-950/20 text-slate-500'
                          : 'border-slate-700 bg-surface text-white focus:border-brand-500'
                        }`}
                      />
                      <button
                        onClick={() => updateSet(i, 'score_a', set.score_a + 1)}
                        className="h-11 w-11 shrink-0 rounded-xl bg-brand-600 text-white hover:bg-brand-500 transition-colors text-xl font-bold"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <span className="text-slate-600 font-bold text-sm shrink-0">–</span>

                  {/* Team B */}
                  <div className="flex-1 space-y-1">
                    <p className="text-[10px] text-slate-600 text-center truncate">{entryLabel(match.entry_b)}</p>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => updateSet(i, 'score_b', set.score_b - 1)}
                        disabled={set.score_b <= 0}
                        className="h-11 w-11 shrink-0 rounded-xl bg-surface ring-1 ring-surface-border text-slate-400 hover:text-white hover:ring-slate-500 disabled:opacity-25 transition-colors text-xl font-bold"
                      >
                        −
                      </button>
                      <input
                        type="number"
                        min={0}
                        max={99}
                        value={set.score_b}
                        onChange={(e) => updateSet(i, 'score_b', parseInt(e.target.value) || 0)}
                        className={`flex-1 min-w-0 rounded-xl border px-2 py-2.5 text-center text-xl font-bold outline-none transition ${
                          bWonSet ? 'border-accent-500/60 bg-accent-500/10 text-accent-300'
                          : aWonSet ? 'border-red-900/30 bg-red-950/20 text-slate-500'
                          : 'border-slate-700 bg-surface text-white focus:border-brand-500'
                        }`}
                      />
                      <button
                        onClick={() => updateSet(i, 'score_b', set.score_b + 1)}
                        className="h-11 w-11 shrink-0 rounded-xl bg-brand-600 text-white hover:bg-brand-500 transition-colors text-xl font-bold"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Add set */}
        <button
          onClick={addSet}
          className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
        >
          + Add set
        </button>

        {/* Winner selector */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-slate-400">Winner</p>
            {isInProgress && <AutoSavePill />}
          </div>
          <div className="flex gap-2">
            {[match.entry_a, match.entry_b].map((entry) => {
              if (!entry) return null;
              const isSelected = effectiveWinnerId === entry.id;
              return (
                <button
                  key={entry.id}
                  onClick={() => setManualWinnerId(entry.id)}
                  className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition-colors ${
                    isSelected
                      ? 'bg-brand-600 text-white ring-2 ring-brand-500'
                      : 'bg-surface text-slate-400 hover:text-white ring-1 ring-surface-border'
                  }`}
                >
                  {entryLabel(entry)}
                  {isSelected && ' ✓'}
                </button>
              );
            })}
          </div>
        </div>

        {/* Serving team picker — shown before match starts */}
        {!isInProgress && match.entry_a && match.entry_b && (
          <div className="rounded-xl bg-surface ring-1 ring-surface-border p-3 space-y-2">
            <p className="text-xs font-medium text-slate-400">Serving Team</p>
            <div className="flex gap-2">
              {[match.entry_a, match.entry_b].map((entry) => {
                const isSelected = servingEntryId === entry.id;
                return (
                  <button
                    key={entry.id}
                    onClick={() => setServingEntryId(isSelected ? null : entry.id)}
                    className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-colors ${
                      isSelected
                        ? 'bg-amber-500/20 text-amber-300 ring-2 ring-amber-500/40'
                        : 'bg-surface-card text-slate-400 hover:text-white ring-1 ring-surface-border'
                    }`}
                  >
                    {isSelected && <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />}
                    {entryLabel(entry)}
                  </button>
                );
              })}
            </div>
            {!servingEntryId && (
              <p className="text-[10px] text-slate-600">Optional — tap to mark the first server</p>
            )}
          </div>
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}

        {/* Action buttons */}
        <div className="flex gap-3 pt-1">
          {isInProgress ? (
            <button
              onClick={() => handleEndMatch(match)}
              disabled={submitting || !effectiveWinnerId}
              className="flex-1 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-40"
            >
              {submitting ? 'Saving…' : '■ End match'}
            </button>
          ) : (
            <button
              onClick={() => handleStart(match.id)}
              disabled={startingMatch === match.id}
              className="flex-1 rounded-xl bg-accent-600 py-3 text-sm font-semibold text-white hover:bg-accent-700 transition-colors disabled:opacity-40"
            >
              {startingMatch === match.id ? 'Starting…' : '▶ Start match'}
            </button>
          )}
          <button
            onClick={closeMatch}
            className="rounded-xl border border-surface-border px-4 py-3 text-sm text-slate-400 hover:text-slate-300 transition-colors"
          >
            Close
          </button>
        </div>

        {/* Re-assignment button */}
        <div className="border-t border-surface-border/60 pt-3 space-y-1.5">
          <button
            onClick={() => handleRequestReassignment(match.id)}
            disabled={pausingMatch === match.id || submitting || startingMatch === match.id}
            className="w-full rounded-xl border border-amber-800/50 py-2.5 text-sm font-medium text-amber-500 hover:bg-amber-950/30 hover:border-amber-700/60 transition-colors disabled:opacity-50"
          >
            {pausingMatch === match.id
              ? 'Requesting…'
              : isInProgress
              ? '⏸ Pause & request re-assignment'
              : '↩ Request re-assignment'}
          </button>
          <p className="text-center text-[11px] text-slate-600">
            {isInProgress
              ? 'Pauses scoring and sends back to admin for a new court or referee'
              : 'Returns this match to admin for re-assignment before you start'}
          </p>
        </div>
      </div>
    );
  }

  // ── Completed match card ──────────────────────────────────────────────────
  function CompletedMatchCard({ match }: { match: Match }) {
    const context = match.group_name ?? match.round_name ?? `Round ${match.round}`;
    const isWalkover = match.status === 'walkover';

    // Identify winner/loser entries for display
    const winnerEntry =
      match.winner_entry_id === match.entry_a?.id ? match.entry_a
      : match.winner_entry_id === match.entry_b?.id ? match.entry_b
      : null;
    const loserEntry =
      match.winner_entry_id === match.entry_a?.id ? match.entry_b
      : match.winner_entry_id === match.entry_b?.id ? match.entry_a
      : null;

    // Score string e.g. "11–7  11–4"
    const scoreStr =
      match.sets.length > 0
        ? match.sets
            .map((s) => {
              // Always show winner's score first — determine side
              const aIsWinner = match.winner_entry_id === match.entry_a?.id;
              return aIsWinner ? `${s.score_a}–${s.score_b}` : `${s.score_b}–${s.score_a}`;
            })
            .join('  ')
        : null;

    const [requestingRestart, setRequestingRestart] = useState(false);
    const [restartDone, setRestartDone] = useState(match.restart_requested);
    const [restartError, setRestartError] = useState<string | null>(null);

    async function handleRequestRestart() {
      setRequestingRestart(true);
      setRestartError(null);
      const result = await requestMatchRestartAction(match.id, pin);
      if (result?.error) {
        setRestartError(result.error);
      } else {
        setRestartDone(true);
      }
      setRequestingRestart(false);
    }

    return (
      <div className="rounded-xl ring-1 ring-surface-border bg-surface-card overflow-hidden">
        {/* Completed banner */}
        <div className="flex items-center gap-2 border-b border-surface-border/40 bg-accent-950/10 px-5 py-1.5">
          <span className="text-[11px] font-semibold text-accent-400">
            {isWalkover ? 'Walkover' : '✓ Completed'}
          </span>
          {match.court && (
            <span className="ml-auto text-[11px] text-slate-600">Court {match.court}</span>
          )}
        </div>

        <div className="px-5 py-4 space-y-3">
          {/* Context */}
          <p className="text-xs text-slate-500">{context}</p>

          {/* Winner / Loser rows */}
          {winnerEntry ? (
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-white truncate">{entryLabel(winnerEntry)}</p>
                <div className="flex items-center gap-2 shrink-0">
                  {scoreStr && (
                    <span className="font-mono text-sm font-bold text-accent-400">{scoreStr}</span>
                  )}
                  <span className="rounded-full bg-accent-500/20 px-2 py-0.5 text-[10px] font-semibold text-accent-400">
                    WON
                  </span>
                </div>
              </div>
              {loserEntry && (
                <p className="text-sm text-slate-500 truncate">{entryLabel(loserEntry)}</p>
              )}
            </div>
          ) : (
            // No winner set (shouldn't normally happen for completed matches)
            <div className="space-y-0.5">
              <p className="text-sm font-semibold text-white truncate">{entryLabel(match.entry_a)}</p>
              <p className="text-xs text-slate-500">vs</p>
              <p className="text-sm font-semibold text-white truncate">{entryLabel(match.entry_b)}</p>
            </div>
          )}

          {/* Accidental-end restart button */}
          {!isWalkover && (
            <div className="pt-1 border-t border-surface-border/50">
              {restartDone ? (
                <p className="text-xs text-amber-400">
                  ⏳ Restart requested — waiting for admin approval
                </p>
              ) : (
                <div className="space-y-1">
                  <button
                    onClick={handleRequestRestart}
                    disabled={requestingRestart}
                    className="text-xs text-amber-500 hover:text-amber-400 transition-colors disabled:opacity-50"
                  >
                    {requestingRestart ? 'Requesting…' : '↩ Accidentally ended? Request restart'}
                  </button>
                  {restartError && (
                    <p className="text-[11px] text-red-400">{restartError}</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Match card ────────────────────────────────────────────────────────────
  function MatchCard({ match }: { match: Match }) {
    const isOpen = activeMatchId === match.id;
    const context = match.group_name ?? match.round_name ?? `Round ${match.round}`;
    const effectiveStatus = locallyStarted.has(match.id) ? 'in_progress' : match.status;
    const isStarted = effectiveStatus === 'in_progress';

    // savedScores is more up-to-date than match.sets (which is server-fetched at page load)
    const displaySets = savedScores.get(match.id) ?? match.sets;
    const liveScore =
      isStarted && displaySets.length > 0
        ? displaySets.map((s) => `${s.score_a}–${s.score_b}`).join('  ')
        : null;

    return (
      <div
        className={`rounded-xl ring-1 transition-all overflow-hidden bg-surface-card ${
          isOpen ? 'ring-brand-500/60' : 'ring-surface-border'
        }`}
      >
        {/* Status strip — shown when in progress and panel is closed */}
        {isStarted && !isOpen && (
          <div className="flex items-center gap-2 border-b border-surface-border/40 bg-accent-950/20 px-5 py-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-400 animate-pulse shrink-0" />
            <span className="text-[11px] font-semibold text-accent-400">In progress</span>
            {liveScore
              ? <span className="ml-auto text-sm font-mono font-bold text-accent-300">{liveScore}</span>
              : <span className="ml-auto text-[11px] text-slate-600">no score yet</span>
            }
          </div>
        )}

        {/* Header — clickable to open/close scoring panel */}
        <button
          className="w-full text-left px-5 py-4"
          onClick={() => (isOpen ? closeMatch() : openMatch(match.id, match.sets))}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-slate-500 mb-1">
                {context}
                {match.court ? ` · Court ${match.court}` : ''}
              </p>
              <div className="space-y-0.5">
                <p className="text-sm font-semibold text-white truncate">{entryLabel(match.entry_a)}</p>
                <p className="text-xs text-slate-500">vs</p>
                <p className="text-sm font-semibold text-white truncate">{entryLabel(match.entry_b)}</p>
              </div>
            </div>
            <div className="shrink-0 text-right">
              {!isStarted && (
                <span className="block text-[11px] font-medium text-slate-600 mb-0.5">Not started</span>
              )}
              <span className={`text-xs ${isOpen ? 'text-brand-400' : 'text-slate-600'}`}>
                {isOpen ? 'Close ↑' : isStarted ? 'Score →' : 'Open →'}
              </span>
            </div>
          </div>
        </button>

        {/* Score entry panel */}
        {isOpen && <ScorePanel match={match} />}
      </div>
    );
  }

  // ── Shared refresh button ─────────────────────────────────────────────────
  function RefreshButton({ className }: { className?: string }) {
    return (
      <button
        onClick={handleManualRefresh}
        disabled={isRefreshing}
        className={className ?? 'flex items-center gap-1.5 rounded-lg border border-surface-border px-3.5 py-2 text-xs font-medium text-slate-400 hover:border-slate-500 hover:text-slate-200 transition-colors disabled:opacity-50'}
      >
        <span className={isRefreshing ? 'animate-spin inline-block' : 'inline-block'}>↻</span>
        {isRefreshing ? 'Refreshing…' : 'Refresh matches'}
      </button>
    );
  }

  // ── Empty state — only when there are no active AND no completed matches ──
  if (matches.length === 0 && completedMatches.length === 0) {
    return (
      <div className="rounded-xl bg-surface-card p-10 text-center ring-1 ring-surface-border">
        <p className="text-2xl mb-2">🎾</p>
        <p className="text-sm font-medium text-white">No matches assigned to you yet</p>
        <p className="mt-1 text-xs text-slate-500">
          Ask the tournament admin to assign you to a match on the scoring hub.
        </p>
        <div className="mt-5 flex justify-center">
          <RefreshButton />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* ── Refresh row — always visible so admin re-assignments appear instantly */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-600">
          {activeMatches.length} match{activeMatches.length !== 1 ? 'es' : ''} assigned to you
        </p>
        <RefreshButton />
      </div>

      {/* ── In Progress — started, being scored ─────────────────────────── */}
      {inProgressMatches.length > 0 && (
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-accent-400">
            In Progress — {inProgressMatches.length} match{inProgressMatches.length !== 1 ? 'es' : ''}
          </h2>
          <div className="space-y-3">
            {inProgressMatches.map((m) => (
              <MatchCard key={m.id} match={m} />
            ))}
          </div>
        </section>
      )}

      {/* ── Scheduled — assigned but not yet started ─────────────────────── */}
      {scheduledMatches.length > 0 && (
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">
            Scheduled — {scheduledMatches.length} match{scheduledMatches.length !== 1 ? 'es' : ''}
          </h2>
          <div className="space-y-3">
            {scheduledMatches.map((m) => (
              <MatchCard key={m.id} match={m} />
            ))}
          </div>
        </section>
      )}

      {activeMatches.length === 0 && (
        <div className="rounded-xl bg-surface-card p-8 text-center ring-1 ring-surface-border">
          <p className="text-sm text-slate-500">No active matches right now</p>
          <p className="mt-1 text-xs text-slate-600">
            The admin will assign a court and match to you shortly.
          </p>
        </div>
      )}

      {/* ── Completed — matches this referee has scored ───────────────────── */}
      {completedMatches.length > 0 && (
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-600">
            Completed — {completedMatches.length} match{completedMatches.length !== 1 ? 'es' : ''}
          </h2>
          <div className="space-y-3">
            {completedMatches.map((m) => (
              <CompletedMatchCard key={m.id} match={m} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
