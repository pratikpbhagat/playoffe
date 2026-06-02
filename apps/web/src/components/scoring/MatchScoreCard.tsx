'use client';

import { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { startMatchAction, submitResultAction, walkoverAction, overrideMatchResultAction, approvePlayerReportAction, rejectPlayerReportAction, pauseMatchForReassignmentAction, saveScoreAction } from '@/lib/actions/scoring';
import { useRealtimeMatch } from '@/hooks/useRealtimeMatch';
import { useConfirm } from '@/components/ui/ConfirmProvider';

interface SetScore {
  set_number: number;
  score_a: number;
  score_b: number;
}

interface EntryInfo {
  id: string;
  seed: number | null;
  player_name: string;
  player_username: string;
  rating: number;
}

interface Props {
  matchId: string;
  tournamentSlug: string;
  categoryId: string;
  status: string;
  court: number | null;
  maxCourts: number;
  initialSets: SetScore[];
  winnerEntryId: string | null;
  entryA: EntryInfo | null;
  entryB: EntryInfo | null;
  /** Entry ID of the team that serves first (null = not set) */
  initialServingEntryId?: string | null;
  /** Current server number (1 or 2) within the serving team. Only used in traditional scoring. */
  initialServerNumber?: number | null;
  /** Points needed to win a set (from category/tournament config). Default 11. */
  pointsPerSet?: number;
  /** Points lead required to win a set (e.g. 2 for win-by-2). Default 2. */
  winBy?: number;
  /** Scoring format — in rally mode serve auto-switches when the non-serving team wins a point. */
  scoringFormat?: 'rally' | 'traditional';
  // Player self-report (optional)
  playerReportedWinnerId?: string | null;
  playerReportedSets?: SetScore[] | null;
  // Pause / re-assignment
  pausedForReassignment?: boolean;
}

function determineSetsWinner(sets: SetScore[]): { aWins: number; bWins: number } {
  let aWins = 0;
  let bWins = 0;
  for (const s of sets) {
    if (s.score_a > s.score_b) aWins++;
    else if (s.score_b > s.score_a) bWins++;
  }
  return { aWins, bWins };
}

export function MatchScoreCard({
  matchId,
  tournamentSlug,
  status: initialStatus,
  court: initialCourt,
  maxCourts,
  initialSets,
  winnerEntryId: initialWinner,
  entryA,
  entryB,
  initialServingEntryId = null,
  initialServerNumber = null,
  pointsPerSet = 11,
  winBy = 2,
  scoringFormat = 'traditional',
  playerReportedWinnerId,
  playerReportedSets,
  pausedForReassignment = false,
}: Props) {
  const router = useRouter();
  const { confirm } = useConfirm();
  const [status, setStatus] = useState(initialStatus);
  const [court, setCourt] = useState<number>(initialCourt ?? 1);
  const [sets, setSets] = useState<SetScore[]>(
    initialSets.length > 0
      ? initialSets
      : [{ set_number: 1, score_a: 0, score_b: 0 }],
  );
  const [winnerEntryId, setWinnerEntryId] = useState<string | null>(initialWinner);
  const [manualWinner, setManualWinner] = useState<string | null>(null);
  const [servingEntryId, setServingEntryId] = useState<string | null>(initialServingEntryId);
  // Keep a ref so the debounced auto-save closure always reads the latest serve
  const servingEntryIdRef = useRef<string | null>(initialServingEntryId);
  /** Server number within the serving team (1 or 2). Traditional scoring only. */
  const [serverNumber, setServerNumber] = useState<number | null>(initialServerNumber);
  const serverNumberRef = useRef<number | null>(initialServerNumber);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [externallyUpdated, setExternallyUpdated] = useState(false);

  // ── Auto-save (debounced) ─────────────────────────────────────────────────
  // Writes the current sets to the DB every 1500 ms after the last keystroke
  // so the display screen receives a Realtime event and shows live scores.
  type AutoSaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';
  const [autoSaveStatus, setAutoSaveStatus] = useState<AutoSaveStatus>('idle');
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout>>();
  const pendingSets = useRef<SetScore[]>([]);

  const triggerAutoSave = useCallback((newSets: SetScore[]) => {
    pendingSets.current = newSets;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    setAutoSaveStatus('pending');
    autoSaveTimer.current = setTimeout(async () => {
      setAutoSaveStatus('saving');
      // Pass the latest serving team so the display screen always sees the correct server
      const result = await saveScoreAction(matchId, pendingSets.current, servingEntryIdRef.current, serverNumberRef.current);
      if (result?.error) {
        setAutoSaveStatus('error');
      } else {
        setAutoSaveStatus('saved');
        setTimeout(() => setAutoSaveStatus('idle'), 2000);
      }
    }, 1500);
  }, [matchId]);

  // Pause / re-assignment state
  const [isPausing, setIsPausing] = useState(false);
  const [pauseError, setPauseError] = useState<string | null>(null);
  const [pauseRequested, setPauseRequested] = useState(pausedForReassignment);

  // Override state — used when organiser corrects a completed result
  const [showOverride, setShowOverride] = useState(false);
  const [overrideSets, setOverrideSets] = useState<SetScore[]>(
    initialSets.length > 0 ? initialSets : [{ set_number: 1, score_a: 0, score_b: 0 }],
  );
  const [overrideWinner, setOverrideWinner] = useState<string | null>(initialWinner);
  const [overriding, setOverriding] = useState(false);
  const [overrideError, setOverrideError] = useState<string | null>(null);

  // Approve / reject player report state
  const [approvingReport, setApprovingReport] = useState(false);
  const [rejectingReport, setRejectingReport] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);

  // Realtime — react to another device completing this match
  const handleExternalComplete = useCallback((winnerId: string | null) => {
    setExternallyUpdated(true);
    setStatus('completed');
    setWinnerEntryId(winnerId);
  }, []);

  const liveStatus = useRealtimeMatch(matchId, {
    currentStatus: status,
    onExternalComplete: handleExternalComplete,
  });

  const isEditable = status === 'scheduled' || status === 'in_progress';
  const isCompleted = status === 'completed' || status === 'walkover';

  // Determine winner from sets
  const { aWins, bWins } = determineSetsWinner(sets);
  const suggestedWinner =
    aWins > bWins ? entryA?.id : bWins > aWins ? entryB?.id : null;
  const effectiveWinner = manualWinner ?? suggestedWinner;

  function updateSet(index: number, field: 'score_a' | 'score_b', value: number) {
    const next = sets.map((s, i) => (i === index ? { ...s, [field]: Math.max(0, value) } : s));
    setSets(next);
    setManualWinner(null);
    // Auto-save to DB so the display screen gets a live Realtime update
    if (status === 'in_progress') triggerAutoSave(next);
  }

  /**
   * Handles a + button click.
   * • Rally: increments score; auto-switches serve when non-serving team scores.
   * • Traditional: only the serving team's + increments score; receiving team's +
   *   is intentionally not wired to this (use the Side-out button instead).
   */
  function handleScoreIncrement(index: number, field: 'score_a' | 'score_b') {
    // Traditional: only serving team can score — silently ignore if receiving team's + is clicked
    if (scoringFormat === 'traditional' && servingEntryId !== null) {
      const servingField = servingEntryId === entryA?.id ? 'score_a' : 'score_b';
      if (field !== servingField) return; // receiving team cannot score directly
    }

    updateSet(index, field, sets[index][field] + 1);

    if (scoringFormat === 'rally' && status === 'in_progress' && servingEntryId !== null) {
      const scoringEntryId = field === 'score_a' ? entryA?.id : entryB?.id;
      if (scoringEntryId && scoringEntryId !== servingEntryId) {
        // Non-serving team won the point → serve passes to them
        setServingEntryId(scoringEntryId);
        servingEntryIdRef.current = scoringEntryId;
        // Save immediately — don't wait for the 1500 ms debounce
        void saveScoreAction(matchId, sets, scoringEntryId, null);
      }
    }
  }

  /**
   * Side-out (traditional scoring only): receiving team wins the rally.
   * No score change. Serve rotation:
   *   Server 1 → Server 2 (same team)
   *   Server 2 → Side-out (opponent gets serve at Server 1)
   * Each new set resets to Server 2.
   */
  function handleSideOut() {
    if (scoringFormat !== 'traditional' || status !== 'in_progress') return;

    let newServingId = servingEntryId;
    let newServerNum: number;

    if (serverNumber === 1) {
      // Same team, move to server 2
      newServerNum = 2;
    } else {
      // Server 2 faulted → side-out to the other team at server 1
      newServingId = servingEntryId === entryA?.id ? (entryB?.id ?? null) : (entryA?.id ?? null);
      newServerNum = 1;
    }

    setServingEntryId(newServingId);
    servingEntryIdRef.current = newServingId;
    setServerNumber(newServerNum);
    serverNumberRef.current = newServerNum;
    // Persist immediately so the display screen reflects the side-out
    void saveScoreAction(matchId, sets, newServingId, newServerNum);
  }

  /**
   * Reset server number to 2 when a new set begins (traditional scoring).
   * Called from the addSet function.
   */
  function resetServerForNewSet() {
    if (scoringFormat !== 'traditional') return;
    setServerNumber(2);
    serverNumberRef.current = 2;
    // Persist
    void saveScoreAction(matchId, sets, servingEntryIdRef.current, 2);
  }

  function addSet() {
    setSets((prev) => [
      ...prev,
      { set_number: prev.length + 1, score_a: 0, score_b: 0 },
    ]);
    // Traditional scoring: each new set starts at server 2
    resetServerForNewSet();
  }

  function removeLastSet() {
    if (sets.length <= 1) return;
    setSets((prev) => prev.slice(0, -1));
  }

  async function handleStart() {
    setLoading(true);
    setError(null);
    // Traditional scoring: first serve always starts at server 2 (pickleball rule)
    const startingServerNum = scoringFormat === 'traditional' ? 2 : null;
    const result = await startMatchAction(matchId, court, undefined, servingEntryId, startingServerNum as 1 | 2 | null);
    if (result.error) {
      setError(result.error);
    } else {
      if (scoringFormat === 'traditional') {
        setServerNumber(2);
        serverNumberRef.current = 2;
      }
      setStatus('in_progress');
      router.refresh();
    }
    setLoading(false);
  }

  async function handlePause() {
    setIsPausing(true);
    setPauseError(null);
    const result = await pauseMatchForReassignmentAction(matchId);
    if (result?.error) {
      setPauseError(result.error);
    } else {
      setPauseRequested(true);
      router.refresh();
    }
    setIsPausing(false);
  }

  async function handleSubmit() {
    if (!effectiveWinner) {
      setError('Please select a winner or adjust scores so one player leads.');
      return;
    }

    // Guard: warn if every set is 0-0 (scores were never filled in)
    const allZero = sets.every((s) => s.score_a === 0 && s.score_b === 0);
    if (allZero) {
      const ok = await confirm({
        title: 'Submit blank scores?',
        message: 'All sets show 0–0. Are you sure you want to submit this result without filling in the scores?',
        confirmLabel: 'Submit anyway',
        variant: 'danger',
      });
      if (!ok) return;
    }

    setLoading(true);
    setError(null);
    // Cancel pending auto-save — final submit will write the definitive score
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    setAutoSaveStatus('idle');
    const result = await submitResultAction(matchId, sets, effectiveWinner);
    if (result.error) {
      setError(result.error);
    } else {
      setStatus('completed');
      setWinnerEntryId(effectiveWinner);
      const ratingA = typeof result.ratingChangeA === 'number' ? result.ratingChangeA : 0;
      const ratingB = typeof result.ratingChangeB === 'number' ? result.ratingChangeB : 0;
      setSuccessMsg(
        `Result saved! Rating: ${entryA?.player_name} ${ratingA >= 0 ? '+' : ''}${ratingA.toFixed(2)}, ${entryB?.player_name} ${ratingB >= 0 ? '+' : ''}${ratingB.toFixed(2)}`,
      );
      router.refresh();
    }
    setLoading(false);
  }

  async function handleWalkover(winnerId: string) {
    const winnerName = winnerId === entryA?.id ? entryA?.player_name : entryB?.player_name;
    if (!await confirm({ title: 'Record walkover?', message: `${winnerName} wins by walkover. The opponent will be marked as a no-show.`, confirmLabel: 'Record walkover' })) return;
    setLoading(true);
    setError(null);
    const result = await walkoverAction(matchId, winnerId);
    if (result.error) {
      setError(result.error);
    } else {
      setStatus('walkover');
      setWinnerEntryId(winnerId);
      router.refresh();
    }
    setLoading(false);
  }

  async function handleApproveReport() {
    setApprovingReport(true);
    setApproveError(null);
    const result = await approvePlayerReportAction(matchId);
    if (result.error) {
      setApproveError(result.error);
    } else {
      setStatus('completed');
      setWinnerEntryId(playerReportedWinnerId ?? null);
      if (playerReportedSets) setSets(playerReportedSets);
      const ratingA = typeof result.ratingChangeA === 'number' ? result.ratingChangeA : 0;
      const ratingB = typeof result.ratingChangeB === 'number' ? result.ratingChangeB : 0;
      setSuccessMsg(
        `Report approved! Rating: ${entryA?.player_name} ${ratingA >= 0 ? '+' : ''}${ratingA.toFixed(2)}, ${entryB?.player_name} ${ratingB >= 0 ? '+' : ''}${ratingB.toFixed(2)}`,
      );
      router.refresh();
    }
    setApprovingReport(false);
  }

  async function handleRejectReport() {
    setRejectingReport(true);
    setApproveError(null);
    const result = await rejectPlayerReportAction(matchId);
    if (result.error) {
      setApproveError(result.error);
    } else {
      router.refresh();
    }
    setRejectingReport(false);
  }

  function updateOverrideSet(index: number, field: 'score_a' | 'score_b', value: number) {
    setOverrideSets((prev) =>
      prev.map((s, i) => (i === index ? { ...s, [field]: Math.max(0, value) } : s)),
    );
    setOverrideWinner(null);
  }

  async function handleOverride() {
    if (!overrideWinner) { setOverrideError('Select the correct winner'); return; }
    setOverriding(true);
    setOverrideError(null);
    const result = await overrideMatchResultAction(matchId, overrideWinner, overrideSets);
    if (result.error) {
      setOverrideError(result.error);
    } else {
      setShowOverride(false);
      router.refresh();
    }
    setOverriding(false);
  }

  // ── Player header ──────────────────────────────────────────────────────────
  function PlayerHeader({ entry, isWinner }: { entry: EntryInfo | null; isWinner: boolean }) {
    if (!entry) return <div className="flex-1 text-slate-600 italic text-sm">TBD</div>;
    const isServing = status === 'in_progress' && servingEntryId === entry.id;
    return (
      <div className={`flex-1 ${isWinner ? '' : isCompleted ? 'opacity-50' : ''}`}>
        <div className="flex items-center gap-2 flex-wrap">
          {entry.seed && (
            <span className="rounded bg-brand-900 px-1.5 py-0.5 text-xs font-bold text-brand-300">
              #{entry.seed}
            </span>
          )}
          <p className={`text-lg font-bold ${isWinner ? 'text-white' : 'text-slate-200'}`}>
            {entry.player_name}
          </p>
          {isWinner && <span className="text-accent-400 text-lg">🏆</span>}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <p className="text-xs text-slate-500">
            @{entry.player_username} · {entry.rating.toFixed(2)}
          </p>
          {isServing && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-400 ring-1 ring-amber-500/30">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              Serving
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Player self-report banner */}
      {playerReportedWinnerId && !isCompleted && (
        <div className="rounded-xl border border-amber-700/40 bg-amber-950/20 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-400">
              Player-reported score
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-slate-300">
              Winner reported:{' '}
              <span className="font-bold text-white">
                {playerReportedWinnerId === entryA?.id
                  ? entryA?.player_name
                  : playerReportedWinnerId === entryB?.id
                  ? entryB?.player_name
                  : 'Unknown'}
              </span>
            </p>
            {playerReportedSets && playerReportedSets.length > 0 && (
              <p className="text-xs text-slate-500">
                Scores:{' '}
                {playerReportedSets.map((s, i) => (
                  <span key={i} className="font-mono mr-2">
                    {s.score_a}–{s.score_b}
                  </span>
                ))}
              </p>
            )}
          </div>

          {approveError && (
            <p className="rounded-lg border border-red-800 bg-red-950 px-3 py-1.5 text-xs text-red-400">
              {approveError}
            </p>
          )}

          <div className="flex items-center gap-3 flex-wrap pt-1">
            <button
              onClick={handleApproveReport}
              disabled={approvingReport || rejectingReport}
              className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 transition-colors disabled:opacity-50"
            >
              {approvingReport ? 'Approving…' : '✓ Approve & submit'}
            </button>
            <button
              onClick={handleRejectReport}
              disabled={approvingReport || rejectingReport}
              className="rounded-lg border border-red-900/50 px-4 py-2 text-sm font-semibold text-red-400 hover:bg-red-950/40 hover:border-red-800/60 transition-colors disabled:opacity-50"
            >
              {rejectingReport ? 'Rejecting…' : '✗ Reject report'}
            </button>
            <p className="text-xs text-slate-500">
              or enter the official score manually below
            </p>
          </div>
        </div>
      )}

      {/* Live connection indicator */}
      {!isCompleted && liveStatus !== 'live' && liveStatus !== 'connecting' && (
        <div className="flex items-center gap-2 rounded-lg border border-yellow-800/50 bg-yellow-950/30 px-3 py-2 text-xs text-yellow-400">
          <span className="h-1.5 w-1.5 rounded-full bg-yellow-400 animate-pulse" />
          {liveStatus === 'reconnecting' ? 'Reconnecting to live updates…' : 'Live updates offline — reload to reconnect'}
        </div>
      )}

      {/* Externally updated banner */}
      {externallyUpdated && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-brand-600/40 bg-brand-600/10 px-4 py-2.5">
          <span className="text-sm text-brand-300">This match was completed on another device.</span>
          <button
            onClick={() => router.refresh()}
            className="text-xs font-semibold text-brand-400 hover:text-brand-300 transition-colors"
          >
            Reload
          </button>
        </div>
      )}

      {/* Status banner */}
      {status === 'in_progress' && !externallyUpdated && !pauseRequested && (
        <div className="flex items-center gap-2 rounded-lg bg-accent-500/10 px-4 py-2 ring-1 ring-accent-500/30">
          <span className="h-2 w-2 rounded-full bg-accent-400 animate-pulse" />
          <span className="text-sm font-medium text-accent-400">Match in progress · Court {court}</span>
        </div>
      )}

      {/* Paused-for-reassignment banner */}
      {status === 'in_progress' && pauseRequested && !externallyUpdated && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-700/40 bg-amber-950/20 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
            <span className="text-sm font-medium text-amber-400">
              ⏸ Referee requested re-assignment
            </span>
          </div>
          <a
            href={`/tournaments/${tournamentSlug}/scoring`}
            className="shrink-0 text-xs text-amber-500 hover:text-amber-300 transition-colors"
          >
            Re-assign on hub →
          </a>
        </div>
      )}
      {isCompleted && !externallyUpdated && (
        <div className="space-y-2">
          <div className="rounded-lg bg-surface-card px-4 py-2 ring-1 ring-surface-border flex items-center justify-between gap-3">
            <span className="text-sm text-slate-400">
              {status === 'walkover' ? 'Walkover' : 'Match completed'} ·{' '}
              {winnerEntryId === entryA?.id ? entryA?.player_name : entryB?.player_name} wins
            </span>
            <button
              onClick={() => {
                setShowOverride((v) => !v);
                setOverrideError(null);
              }}
              className="shrink-0 text-xs text-slate-500 hover:text-amber-400 transition-colors"
            >
              {showOverride ? 'Cancel override' : 'Override result'}
            </button>
          </div>

          {/* ── Override panel ───────────────────────────────────────────── */}
          {showOverride && (
            <div className="rounded-xl border border-amber-700/40 bg-amber-950/20 p-5 space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-400 mb-0.5">
                  Override result
                </p>
                <p className="text-xs text-slate-500">
                  Corrects the winner, recalculates ratings, and re-advances the bracket.
                  Blocked if any downstream match has already been played.
                </p>
              </div>

              {/* Override score entry */}
              <div className="rounded-lg bg-surface-card ring-1 ring-surface-border overflow-hidden">
                <div className="border-b border-surface-border px-4 py-2">
                  <p className="text-xs font-medium text-slate-400">Corrected scores</p>
                </div>
                <div className="divide-y divide-surface-border">
                  <div className="grid grid-cols-[3rem_1fr_2rem_1fr] items-center gap-3 px-4 py-2">
                    <span className="text-xs text-slate-600">Set</span>
                    <span className="text-xs text-slate-500 text-center">{entryA?.player_name ?? 'A'}</span>
                    <span />
                    <span className="text-xs text-slate-500 text-center">{entryB?.player_name ?? 'B'}</span>
                  </div>
                  {overrideSets.map((set, i) => (
                    <div key={i} className="grid grid-cols-[3rem_1fr_2rem_1fr] items-center gap-3 px-4 py-3">
                      <span className="text-xs font-bold text-slate-500">{set.set_number}</span>
                      <input
                        type="number" min={0} max={99} value={set.score_a}
                        onChange={(e) => updateOverrideSet(i, 'score_a', parseInt(e.target.value) || 0)}
                        className="block w-full rounded border border-slate-600 bg-surface px-2 py-1.5 text-center text-base font-bold text-white outline-none focus:border-amber-500"
                      />
                      <span className="text-center text-slate-600 font-bold">–</span>
                      <input
                        type="number" min={0} max={99} value={set.score_b}
                        onChange={(e) => updateOverrideSet(i, 'score_b', parseInt(e.target.value) || 0)}
                        className="block w-full rounded border border-slate-600 bg-surface px-2 py-1.5 text-center text-base font-bold text-white outline-none focus:border-amber-500"
                      />
                    </div>
                  ))}
                  <div className="flex gap-3 border-t border-surface-border px-4 py-2">
                    <button onClick={() => setOverrideSets((p) => [...p, { set_number: p.length + 1, score_a: 0, score_b: 0 }])} className="text-xs text-slate-400 hover:text-amber-400 transition-colors">+ Add set</button>
                    {overrideSets.length > 1 && (
                      <button onClick={() => setOverrideSets((p) => p.slice(0, -1))} className="text-xs text-slate-400 hover:text-red-400 transition-colors">Remove last</button>
                    )}
                  </div>
                </div>
              </div>

              {/* Correct winner selector */}
              <div>
                <p className="mb-2 text-xs font-medium text-slate-400">Correct winner</p>
                <div className="flex gap-3">
                  {[entryA, entryB].map((entry) => {
                    if (!entry) return null;
                    const isSelected = overrideWinner === entry.id;
                    return (
                      <button
                        key={entry.id}
                        onClick={() => setOverrideWinner(entry.id)}
                        className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-colors ${
                          isSelected
                            ? 'bg-amber-600 text-white ring-2 ring-amber-500'
                            : 'bg-surface text-slate-400 hover:text-white ring-1 ring-surface-border'
                        }`}
                      >
                        {entry.player_name}{isSelected ? ' ✓' : ''}
                      </button>
                    );
                  })}
                </div>
              </div>

              {overrideError && (
                <p className="rounded-lg border border-red-800 bg-red-950 px-3 py-2 text-xs text-red-400">
                  {overrideError}
                </p>
              )}

              <button
                onClick={handleOverride}
                disabled={overriding || !overrideWinner}
                className="w-full rounded-lg bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 transition-colors disabled:opacity-50"
              >
                {overriding ? 'Applying override…' : 'Confirm override'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Players row */}
      <div className="flex items-start justify-between gap-6 rounded-xl bg-surface-card px-6 py-5 ring-1 ring-surface-border">
        <PlayerHeader entry={entryA} isWinner={winnerEntryId === entryA?.id} />
        <div className="shrink-0 text-slate-700 font-bold text-lg">vs</div>
        <PlayerHeader entry={entryB} isWinner={winnerEntryId === entryB?.id} />
      </div>

      {/* Court selector (only before match starts) */}
      {status === 'scheduled' && (
        <div className="rounded-xl bg-surface-card px-5 py-4 ring-1 ring-surface-border">
          <label className="mb-2 block text-xs font-medium text-slate-400">Court assignment</label>
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: maxCourts }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                onClick={() => setCourt(n)}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                  court === n
                    ? 'bg-brand-600 text-white'
                    : 'bg-surface text-slate-400 hover:bg-surface-border hover:text-white ring-1 ring-surface-border'
                }`}
              >
                Court {n}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Serving team picker (only before match starts) */}
      {status === 'scheduled' && entryA && entryB && (
        <div className="rounded-xl bg-surface-card px-5 py-4 ring-1 ring-surface-border">
          <p className="mb-3 text-xs font-medium text-slate-400">Serving Team</p>
          <div className="flex gap-3">
            {[entryA, entryB].map((entry) => {
              const isSelected = servingEntryId === entry.id;
              return (
                <button
                  key={entry.id}
                  onClick={() => {
                    const next = isSelected ? null : entry.id;
                    setServingEntryId(next);
                    servingEntryIdRef.current = next;
                  }}
                  className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition-colors ${
                    isSelected
                      ? 'bg-amber-500/20 text-amber-300 ring-2 ring-amber-500/50'
                      : 'bg-surface text-slate-400 hover:text-white ring-1 ring-surface-border'
                  }`}
                >
                  {isSelected && (
                    <span className="h-2 w-2 rounded-full bg-amber-400 shrink-0" />
                  )}
                  {entry.player_name}
                </button>
              );
            })}
          </div>
          {!servingEntryId && (
            <p className="mt-2 text-[11px] text-slate-600">Optional — tap a team to mark the first server</p>
          )}
        </div>
      )}

      {/* Score entry */}
      <div className="rounded-xl bg-surface-card ring-1 ring-surface-border overflow-hidden">
        <div className="border-b border-surface-border px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-white">Scores</h3>
            {/* Auto-save status pill — only visible while in progress */}
            {status === 'in_progress' && autoSaveStatus !== 'idle' && (
              <span className={`text-[11px] font-medium ${
                autoSaveStatus === 'saved'  ? 'text-accent-400'
                : autoSaveStatus === 'error' ? 'text-red-400'
                : 'text-slate-500'
              }`}>
                {autoSaveStatus === 'pending' ? '…'
                 : autoSaveStatus === 'saving' ? 'Saving…'
                 : autoSaveStatus === 'saved'  ? '✓ Saved'
                 : '⚠ Save failed'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-slate-600">First to {pointsPerSet} · win by {winBy}</span>
            {/* Traditional: show live announcement format X-Y-Z next to the sets counter */}
            {scoringFormat === 'traditional' && servingEntryId !== null && serverNumber !== null && (
              <div className="flex items-center gap-1 rounded-lg bg-amber-500/10 ring-1 ring-amber-500/30 px-3 py-1">
                <span className="text-base font-black tabular-nums text-white">
                  {servingEntryId === entryA?.id ? sets[sets.length - 1]?.score_a ?? 0 : sets[sets.length - 1]?.score_b ?? 0}
                  <span className="text-slate-500 mx-1">–</span>
                  {servingEntryId === entryA?.id ? sets[sets.length - 1]?.score_b ?? 0 : sets[sets.length - 1]?.score_a ?? 0}
                  <span className="text-slate-500 mx-1">–</span>
                  <span className="text-amber-400">{serverNumber}</span>
                </span>
              </div>
            )}
            <div className="flex items-center gap-2 text-xs font-bold tabular-nums">
              <span className="text-2xl text-white">{aWins}</span>
              <span className="text-slate-500">—</span>
              <span className="text-2xl text-white">{bWins}</span>
              <span className="ml-1 text-slate-500">sets</span>
            </div>
          </div>
        </div>

        {/* Set rows */}
        <div className="divide-y divide-surface-border">
          {/* Column header */}
          <div className="grid grid-cols-[2.5rem_1fr_2.5rem_1fr] items-center gap-2 px-5 py-2">
            <span className="text-xs text-slate-600">Set</span>
            <span className="text-xs text-slate-500 text-center">{entryA?.player_name ?? 'A'}</span>
            <span />
            <span className="text-xs text-slate-500 text-center">{entryB?.player_name ?? 'B'}</span>
          </div>

          {sets.map((set, i) => {
            // Determine if this set has a winner (for coloring)
            const aLeads = set.score_a - set.score_b;
            const bLeads = set.score_b - set.score_a;
            const aWonSet = set.score_a >= pointsPerSet && aLeads >= winBy;
            const bWonSet = set.score_b >= pointsPerSet && bLeads >= winBy;

            return (
              <div key={i} className="grid grid-cols-[2.5rem_1fr_2.5rem_1fr] items-center gap-2 px-5 py-3">
                <span className="text-xs font-bold text-slate-500">{set.set_number}</span>

                {/* Team A score + buttons */}
                <div className="flex items-center gap-1.5">
                  {isEditable && (
                    <button
                      onClick={() => updateSet(i, 'score_a', set.score_a - 1)}
                      disabled={set.score_a <= 0}
                      className="h-9 w-9 shrink-0 rounded-lg bg-surface ring-1 ring-surface-border text-slate-400 hover:text-white hover:ring-slate-500 disabled:opacity-25 transition-colors text-base font-bold"
                    >
                      −
                    </button>
                  )}
                  <input
                    type="number"
                    min={0}
                    max={99}
                    value={set.score_a}
                    onChange={(e) => updateSet(i, 'score_a', parseInt(e.target.value) || 0)}
                    disabled={!isEditable}
                    className={`flex-1 min-w-0 block rounded-lg border px-2 py-2 text-center text-lg font-bold outline-none transition disabled:opacity-60 ${
                      aWonSet ? 'border-accent-500/60 bg-accent-500/10 text-accent-300'
                      : bWonSet ? 'border-red-900/30 bg-red-950/20 text-slate-500'
                      : 'border-slate-600 bg-surface text-white focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30'
                    }`}
                  />
                  {isEditable && (
                    <button
                      onClick={() => handleScoreIncrement(i, 'score_a')}
                      className="h-9 w-9 shrink-0 rounded-lg bg-brand-600 text-white hover:bg-brand-500 transition-colors text-base font-bold"
                    >
                      +
                    </button>
                  )}
                </div>

                <span className="text-center text-slate-600 font-bold text-sm">–</span>

                {/* Team B score + buttons */}
                <div className="flex items-center gap-1.5">
                  {isEditable && (
                    <button
                      onClick={() => updateSet(i, 'score_b', set.score_b - 1)}
                      disabled={set.score_b <= 0}
                      className="h-9 w-9 shrink-0 rounded-lg bg-surface ring-1 ring-surface-border text-slate-400 hover:text-white hover:ring-slate-500 disabled:opacity-25 transition-colors text-base font-bold"
                    >
                      −
                    </button>
                  )}
                  <input
                    type="number"
                    min={0}
                    max={99}
                    value={set.score_b}
                    onChange={(e) => updateSet(i, 'score_b', parseInt(e.target.value) || 0)}
                    disabled={!isEditable}
                    className={`flex-1 min-w-0 block rounded-lg border px-2 py-2 text-center text-lg font-bold outline-none transition disabled:opacity-60 ${
                      bWonSet ? 'border-accent-500/60 bg-accent-500/10 text-accent-300'
                      : aWonSet ? 'border-red-900/30 bg-red-950/20 text-slate-500'
                      : 'border-slate-600 bg-surface text-white focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30'
                    }`}
                  />
                  {isEditable && (
                    <button
                      onClick={() => handleScoreIncrement(i, 'score_b')}
                      className="h-9 w-9 shrink-0 rounded-lg bg-brand-600 text-white hover:bg-brand-500 transition-colors text-base font-bold"
                    >
                      +
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Add/remove set */}
        {isEditable && (
          <div className="flex items-center gap-3 border-t border-surface-border px-5 py-3">
            <button
              onClick={addSet}
              className="text-xs text-slate-400 hover:text-brand-400 transition-colors"
            >
              + Add set
            </button>
            {sets.length > 1 && (
              <button
                onClick={removeLastSet}
                className="text-xs text-slate-400 hover:text-red-400 transition-colors"
              >
                Remove last
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Side-out button (traditional scoring only) ─────────────────────── */}
      {isEditable && scoringFormat === 'traditional' && servingEntryId !== null && (
        <div className="rounded-xl bg-amber-950/20 ring-1 ring-amber-700/30 px-5 py-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-amber-400 mb-0.5">Side-out</p>
              <p className="text-[11px] text-slate-500">
                {serverNumber === 1
                  ? `Server 1 → Server 2 · serve stays with ${servingEntryId === entryA?.id ? entryA?.player_name : entryB?.player_name}`
                  : `Server 2 → Side-out · serve passes to ${servingEntryId === entryA?.id ? entryB?.player_name : entryA?.player_name}`}
              </p>
            </div>
            <button
              onClick={handleSideOut}
              disabled={!status || status !== 'in_progress'}
              className="shrink-0 rounded-lg border border-amber-700/50 bg-amber-950/40 px-4 py-2 text-sm font-semibold text-amber-400 hover:bg-amber-900/40 hover:border-amber-600/60 transition-colors disabled:opacity-40"
            >
              ↩ Side-out
            </button>
          </div>
        </div>
      )}

      {/* Winner selector (when tied or editable) */}
      {isEditable && (
        <div className="rounded-xl bg-surface-card px-5 py-4 ring-1 ring-surface-border">
          <p className="mb-3 text-xs font-medium text-slate-400">Winner</p>
          <div className="flex gap-3">
            {[entryA, entryB].map((entry) => {
              if (!entry) return null;
              const isSelected = (manualWinner ?? suggestedWinner) === entry.id;
              return (
                <button
                  key={entry.id}
                  onClick={() => setManualWinner(entry.id)}
                  className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition-colors ${
                    isSelected
                      ? 'bg-brand-600 text-white ring-2 ring-brand-500'
                      : 'bg-surface text-slate-400 hover:text-white ring-1 ring-surface-border'
                  }`}
                >
                  {entry.player_name}
                  {isSelected && ' ✓'}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Error / success */}
      {error && (
        <div className="rounded-lg border border-red-800 bg-red-950 px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}
      {successMsg && (
        <div className="rounded-lg border border-accent-500/30 bg-accent-500/10 px-3 py-2 text-xs text-accent-400">
          {successMsg}
        </div>
      )}

      {/* Action buttons */}
      {!isCompleted && (
        <div className="flex flex-wrap gap-3">
          {status === 'scheduled' && (
            <div className="flex-1 space-y-1.5">
              <button
                onClick={handleStart}
                disabled={loading || !servingEntryId}
                className="w-full rounded-lg bg-accent-600 px-5 py-3 text-sm font-semibold text-white hover:bg-accent-700 transition-colors disabled:opacity-50"
              >
                {loading ? 'Starting…' : '▶ Start match'}
              </button>
              {!servingEntryId && (
                <p className="text-center text-[11px] text-amber-500/80">
                  Select a serving team above before starting
                </p>
              )}
            </div>
          )}

          {status === 'in_progress' && (
            <button
              onClick={handleSubmit}
              disabled={loading || !effectiveWinner}
              className="flex-1 rounded-lg bg-brand-600 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'Saving…' : '■ End match'}
            </button>
          )}

          {/* Walkover buttons */}
          <div className="flex gap-2 w-full">
            {[entryA, entryB].map((entry) => {
              if (!entry) return null;
              return (
                <button
                  key={entry.id}
                  onClick={() => handleWalkover(entry.id)}
                  disabled={loading}
                  className="flex-1 rounded-lg border border-slate-600 px-3 py-2 text-xs text-slate-400 hover:border-slate-400 hover:text-white transition-colors disabled:opacity-50"
                >
                  {entry.player_name} W/O
                </button>
              );
            })}
          </div>

          {/* Pause for re-assignment — only while in_progress and not yet paused */}
          {status === 'in_progress' && !pauseRequested && (
            <button
              onClick={handlePause}
              disabled={isPausing || loading}
              className="w-full rounded-lg border border-amber-800/50 px-5 py-2.5 text-sm font-medium text-amber-500 hover:bg-amber-950/30 hover:border-amber-700/60 transition-colors disabled:opacity-50"
            >
              {isPausing ? 'Pausing…' : '⏸ Pause for re-assignment'}
            </button>
          )}
          {pauseError && (
            <p className="w-full text-xs text-red-400">{pauseError}</p>
          )}
        </div>
      )}

      {/* Back link */}
      <div className="pt-2">
        <a
          href={`/tournaments/${tournamentSlug}/scoring`}
          className="text-xs text-slate-400 hover:text-white transition-colors"
        >
          ← Back to scoring hub
        </a>
      </div>
    </div>
  );
}
