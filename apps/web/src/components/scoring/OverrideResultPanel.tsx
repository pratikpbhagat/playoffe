'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { overrideMatchResultAction } from '@/lib/actions/scoring';

interface SetScore {
  score_a: number;
  score_b: number;
}

interface Props {
  matchId: string;
  entryAId: string;
  entryAName: string;
  entryBId: string;
  entryBName: string;
  currentWinnerId: string | null;
  currentSets: { set_number: number; score_a: number; score_b: number }[];
}

export function OverrideResultPanel({
  matchId,
  entryAId,
  entryAName,
  entryBId,
  entryBName,
  currentWinnerId,
  currentSets,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [winnerId, setWinnerId] = useState(currentWinnerId ?? entryAId);
  const [sets, setSets] = useState<SetScore[]>(
    currentSets.length > 0
      ? currentSets.map(({ score_a, score_b }) => ({ score_a, score_b }))
      : [{ score_a: 0, score_b: 0 }],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateSet(index: number, field: 'score_a' | 'score_b', value: string) {
    const n = parseInt(value, 10);
    setSets((prev) =>
      prev.map((s, i) => (i === index ? { ...s, [field]: isNaN(n) ? 0 : n } : s)),
    );
  }

  function addSet() {
    setSets((prev) => [...prev, { score_a: 0, score_b: 0 }]);
  }

  function removeSet(index: number) {
    if (sets.length <= 1) return;
    setSets((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSave() {
    if (!confirm(`Override result to: ${winnerId === entryAId ? entryAName : entryBName} wins? This rewrites the bracket.`)) return;
    setSaving(true);
    setError(null);
    const payload = sets.map((s, i) => ({
      set_number: i + 1,
      score_a: s.score_a,
      score_b: s.score_b,
    }));
    const result = await overrideMatchResultAction(matchId, winnerId, payload);
    if ('error' in result && result.error) {
      setError(result.error as string);
    } else {
      setOpen(false);
      router.refresh();
    }
    setSaving(false);
  }

  return (
    <div className="mt-6 rounded-xl ring-1 ring-red-800/40 overflow-hidden">
      {/* Header toggle */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 bg-red-950/20 hover:bg-red-950/30 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <span className="text-red-400 text-sm">⚠️</span>
          <span className="text-sm font-semibold text-red-300">Override result</span>
          <span className="text-xs text-red-400/60">Organiser correction only</span>
        </div>
        <span className="text-red-400/60 text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-5 py-5 bg-red-950/10 space-y-5">
          <p className="text-xs text-slate-500">
            Correcting a completed result will undo the previous bracket advancement and re-apply with the new winner. Downstream matches that are already in progress or completed cannot be overridden.
          </p>

          {/* Winner selection */}
          <div>
            <p className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">Correct winner</p>
            <div className="grid grid-cols-2 gap-2">
              {[{ id: entryAId, name: entryAName }, { id: entryBId, name: entryBName }].map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => setWinnerId(entry.id)}
                  className={`rounded-lg px-4 py-3 text-sm font-medium text-left transition-all ${
                    winnerId === entry.id
                      ? 'bg-brand-600/30 ring-2 ring-brand-500 text-white'
                      : 'bg-surface ring-1 ring-surface-border text-slate-400 hover:text-white'
                  }`}
                >
                  {winnerId === entry.id && <span className="mr-1.5">✓</span>}
                  {entry.name}
                </button>
              ))}
            </div>
          </div>

          {/* Set scores */}
          <div>
            <p className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">Set scores</p>
            <div className="space-y-2">
              {sets.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-slate-600 w-10 shrink-0">Set {i + 1}</span>
                  <input
                    type="number"
                    min={0}
                    value={s.score_a}
                    onChange={(e) => updateSet(i, 'score_a', e.target.value)}
                    className="w-16 rounded-lg border border-surface-border bg-surface px-2 py-1.5 text-center text-sm text-white focus:border-brand-500 focus:outline-none"
                  />
                  <span className="text-slate-600">–</span>
                  <input
                    type="number"
                    min={0}
                    value={s.score_b}
                    onChange={(e) => updateSet(i, 'score_b', e.target.value)}
                    className="w-16 rounded-lg border border-surface-border bg-surface px-2 py-1.5 text-center text-sm text-white focus:border-brand-500 focus:outline-none"
                  />
                  {sets.length > 1 && (
                    <button
                      onClick={() => removeSet(i)}
                      className="text-slate-700 hover:text-red-400 transition-colors text-xs ml-1"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
            {sets.length < 5 && (
              <button
                onClick={addSet}
                className="mt-2 text-xs text-slate-600 hover:text-slate-400 transition-colors"
              >
                + Add set
              </button>
            )}
          </div>

          {error && (
            <p className="rounded-lg bg-red-900/30 px-4 py-2 text-xs text-red-300">{error}</p>
          )}

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600 transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save override'}
            </button>
            <button
              onClick={() => setOpen(false)}
              className="text-xs text-slate-600 hover:text-slate-400 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
