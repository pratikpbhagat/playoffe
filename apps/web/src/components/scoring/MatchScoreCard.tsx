'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { startMatchAction, submitResultAction, walkoverAction } from '@/lib/actions/scoring';

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
}: Props) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [court, setCourt] = useState<number>(initialCourt ?? 1);
  const [sets, setSets] = useState<SetScore[]>(
    initialSets.length > 0
      ? initialSets
      : [{ set_number: 1, score_a: 0, score_b: 0 }],
  );
  const [winnerEntryId, setWinnerEntryId] = useState<string | null>(initialWinner);
  const [manualWinner, setManualWinner] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const isEditable = status === 'scheduled' || status === 'in_progress';
  const isCompleted = status === 'completed' || status === 'walkover';

  // Determine winner from sets
  const { aWins, bWins } = determineSetsWinner(sets);
  const suggestedWinner =
    aWins > bWins ? entryA?.id : bWins > aWins ? entryB?.id : null;
  const effectiveWinner = manualWinner ?? suggestedWinner;

  function updateSet(index: number, field: 'score_a' | 'score_b', value: number) {
    setSets((prev) =>
      prev.map((s, i) => (i === index ? { ...s, [field]: Math.max(0, value) } : s)),
    );
    setManualWinner(null); // reset manual selection when scores change
  }

  function addSet() {
    setSets((prev) => [
      ...prev,
      { set_number: prev.length + 1, score_a: 0, score_b: 0 },
    ]);
  }

  function removeLastSet() {
    if (sets.length <= 1) return;
    setSets((prev) => prev.slice(0, -1));
  }

  async function handleStart() {
    setLoading(true);
    setError(null);
    const result = await startMatchAction(matchId, court);
    if (result.error) {
      setError(result.error);
    } else {
      setStatus('in_progress');
      router.refresh();
    }
    setLoading(false);
  }

  async function handleSubmit() {
    if (!effectiveWinner) {
      setError('Please select a winner or adjust scores so one player leads.');
      return;
    }
    setLoading(true);
    setError(null);
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
    if (!confirm(`Record walkover — ${winnerId === entryA?.id ? entryA?.player_name : entryB?.player_name} wins?`)) return;
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

  // ── Player header ──────────────────────────────────────────────────────────
  function PlayerHeader({ entry, isWinner }: { entry: EntryInfo | null; isWinner: boolean }) {
    if (!entry) return <div className="flex-1 text-slate-600 italic text-sm">TBD</div>;
    return (
      <div className={`flex-1 ${isWinner ? '' : isCompleted ? 'opacity-50' : ''}`}>
        <div className="flex items-center gap-2">
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
        <p className="text-xs text-slate-500 mt-0.5">
          @{entry.player_username} · {entry.rating.toFixed(2)}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Status banner */}
      {status === 'in_progress' && (
        <div className="flex items-center gap-2 rounded-lg bg-accent-500/10 px-4 py-2 ring-1 ring-accent-500/30">
          <span className="h-2 w-2 rounded-full bg-accent-400 animate-pulse" />
          <span className="text-sm font-medium text-accent-400">Match in progress · Court {court}</span>
        </div>
      )}
      {isCompleted && (
        <div className="rounded-lg bg-surface-card px-4 py-2 ring-1 ring-surface-border text-center">
          <span className="text-sm text-slate-400">
            {status === 'walkover' ? 'Walkover' : 'Match completed'} ·{' '}
            {winnerEntryId === entryA?.id ? entryA?.player_name : entryB?.player_name} wins
          </span>
        </div>
      )}

      {/* Players row */}
      <div className="flex items-start justify-between gap-6 rounded-xl bg-surface-card px-6 py-5 ring-1 ring-surface-border">
        <PlayerHeader entry={entryA} isWinner={winnerEntryId === entryA?.id} />
        <div className="shrink-0 text-slate-700 font-bold text-lg">vs</div>
        <PlayerHeader entry={entryB} isWinner={winnerEntryId === entryB?.id} />
      </div>

      {/* Court selector (only before/during match) */}
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

      {/* Score entry */}
      <div className="rounded-xl bg-surface-card ring-1 ring-surface-border overflow-hidden">
        <div className="border-b border-surface-border px-5 py-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Scores</h3>
          <div className="flex items-center gap-2 text-xs font-bold tabular-nums">
            <span className="text-2xl text-white">{aWins}</span>
            <span className="text-slate-500">—</span>
            <span className="text-2xl text-white">{bWins}</span>
            <span className="ml-2 text-slate-500">sets</span>
          </div>
        </div>

        {/* Set rows */}
        <div className="divide-y divide-surface-border">
          {/* Header */}
          <div className="grid grid-cols-[3rem_1fr_2rem_1fr] items-center gap-3 px-5 py-2">
            <span className="text-xs text-slate-600">Set</span>
            <span className="text-xs text-slate-500 text-center">{entryA?.player_name ?? 'A'}</span>
            <span />
            <span className="text-xs text-slate-500 text-center">{entryB?.player_name ?? 'B'}</span>
          </div>

          {sets.map((set, i) => (
            <div key={i} className="grid grid-cols-[3rem_1fr_2rem_1fr] items-center gap-3 px-5 py-3">
              <span className="text-xs font-bold text-slate-500">{set.set_number}</span>

              <input
                type="number"
                min={0}
                max={99}
                value={set.score_a}
                onChange={(e) => updateSet(i, 'score_a', parseInt(e.target.value) || 0)}
                disabled={!isEditable}
                className="block w-full rounded-lg border border-slate-600 bg-surface px-3 py-2 text-center text-lg font-bold text-white outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 disabled:opacity-60 transition"
              />

              <span className="text-center text-slate-600 font-bold">–</span>

              <input
                type="number"
                min={0}
                max={99}
                value={set.score_b}
                onChange={(e) => updateSet(i, 'score_b', parseInt(e.target.value) || 0)}
                disabled={!isEditable}
                className="block w-full rounded-lg border border-slate-600 bg-surface px-3 py-2 text-center text-lg font-bold text-white outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 disabled:opacity-60 transition"
              />
            </div>
          ))}
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
            <button
              onClick={handleStart}
              disabled={loading}
              className="flex-1 rounded-lg bg-accent-600 px-5 py-3 text-sm font-semibold text-white hover:bg-accent-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'Starting…' : '▶ Start match'}
            </button>
          )}

          {status === 'in_progress' && (
            <button
              onClick={handleSubmit}
              disabled={loading || !effectiveWinner}
              className="flex-1 rounded-lg bg-brand-600 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'Saving…' : 'Submit result'}
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
