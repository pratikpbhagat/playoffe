'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createKnockoutMatchAction, deleteKnockoutMatchAction, getKnockoutBuilderStateAction } from '@/lib/actions/draws';
import type { KnockoutBuilderState, KnockoutPoolEntry } from '@/lib/actions/draws';

function pairAlreadyExists(pairs: [string, string][], a: string, b: string): boolean {
  return pairs.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

/** Greedy "AI assistant" suggestions: pair up pool entries from different
 *  groups that haven't already played each other in this knockout stage. */
function suggestMatchups(pool: KnockoutPoolEntry[], existingPairs: [string, string][]): [KnockoutPoolEntry, KnockoutPoolEntry][] {
  const used = new Set<string>();
  const suggestions: [KnockoutPoolEntry, KnockoutPoolEntry][] = [];
  for (let i = 0; i < pool.length; i++) {
    const a = pool[i];
    if (used.has(a.entryId)) continue;
    for (let j = i + 1; j < pool.length; j++) {
      const b = pool[j];
      if (used.has(b.entryId)) continue;
      if (a.groupName && b.groupName && a.groupName === b.groupName) continue;
      if (pairAlreadyExists(existingPairs, a.entryId, b.entryId)) continue;
      suggestions.push([a, b]);
      used.add(a.entryId);
      used.add(b.entryId);
      break;
    }
  }
  return suggestions;
}

interface Props {
  categoryId: string;
  initialState: KnockoutBuilderState;
}

export function KnockoutBuilder({ categoryId, initialState }: Props) {
  const router = useRouter();
  const [state, setState] = useState(initialState);
  const [selectedA, setSelectedA] = useState<string | null>(null);
  const [selectedB, setSelectedB] = useState<string | null>(null);
  const [roundName, setRoundName] = useState(initialState.suggestedRoundName ?? '');
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!state.groupStageComplete) {
    return (
      <div className="rounded-lg border border-surface-border bg-surface-card px-4 py-3 text-sm text-text-secondary">
        All group-stage matches must be completed before the knockout bracket can be built.
      </div>
    );
  }

  function selectEntry(entryId: string) {
    setError(null);
    if (selectedA === entryId) { setSelectedA(null); return; }
    if (selectedB === entryId) { setSelectedB(null); return; }
    if (!selectedA) { setSelectedA(entryId); return; }
    if (!selectedB) { setSelectedB(entryId); return; }
    // both already selected — replace the first
    setSelectedA(entryId);
    setSelectedB(null);
  }

  const duplicateWarning =
    selectedA && selectedB && pairAlreadyExists(state.existingPairs, selectedA, selectedB)
      ? 'A match between these two entries has already been scheduled in this knockout stage.'
      : null;

  const suggestions = useMemo(
    () => (state.currentPool ? suggestMatchups(state.currentPool, state.existingPairs) : []),
    [state.currentPool, state.existingPairs],
  );

  async function handleCreateMatch(aId?: string, bId?: string) {
    const a = aId ?? selectedA;
    const b = bId ?? selectedB;
    if (!a || !b) return;
    if (pairAlreadyExists(state.existingPairs, a, b)) {
      setError('A match between these two entries has already been scheduled in this knockout stage.');
      return;
    }
    setCreating(true);
    setError(null);
    const result = await createKnockoutMatchAction(categoryId, a, b, roundName);
    if ('error' in result && result.error) {
      setError(result.error);
      setCreating(false);
      return;
    }
    setSelectedA(null);
    setSelectedB(null);
    router.refresh();
    await refreshState();
    setCreating(false);
  }

  async function handleDeleteMatch(matchId: string) {
    setDeletingId(matchId);
    setError(null);
    const result = await deleteKnockoutMatchAction(categoryId, matchId);
    if ('error' in result && result.error) {
      setError(result.error);
      setDeletingId(null);
      return;
    }
    router.refresh();
    await refreshState();
    setDeletingId(null);
  }

  async function refreshState() {
    const result = await getKnockoutBuilderStateAction(categoryId);
    if ('data' in result) {
      setState(result.data);
      setRoundName(result.data.suggestedRoundName ?? '');
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Existing knockout rounds */}
      {state.rounds.map((r) => (
        <div key={r.round} className="rounded-lg border border-surface-border bg-surface-card">
          <div className="border-b border-surface-border px-4 py-2 text-sm font-medium text-text-primary">
            {r.roundName}
          </div>
          <div className="divide-y divide-surface-border">
            {r.matches.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <div className="flex items-center gap-2">
                  <span className={m.winner_entry_id === m.entry_a?.id ? 'font-semibold text-text-primary' : 'text-text-secondary'}>
                    {m.entry_a?.displayName ?? 'TBD'}
                  </span>
                  <span className="text-text-secondary">vs</span>
                  <span className={m.winner_entry_id === m.entry_b?.id ? 'font-semibold text-text-primary' : 'text-text-secondary'}>
                    {m.entry_b?.displayName ?? 'TBD'}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs uppercase tracking-wide text-text-secondary">{m.status}</span>
                  {m.status === 'scheduled' && (
                    <button
                      onClick={() => handleDeleteMatch(m.id)}
                      disabled={deletingId === m.id}
                      className="text-xs text-red-400 hover:underline disabled:opacity-50"
                    >
                      {deletingId === m.id ? 'Removing…' : 'Remove'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Champion */}
      {state.champion && (
        <div className="rounded-lg border border-brand-600 bg-brand-600/10 px-4 py-3 text-sm text-text-primary">
          🏆 Champion: <span className="font-semibold">{state.champion.displayName}</span>
        </div>
      )}

      {/* Builder for next round */}
      {state.currentPool && (
        <div className="rounded-lg border border-surface-border bg-surface-card p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-text-primary">
              Available pool ({state.currentPool.length})
            </h2>
            <input
              type="text"
              value={roundName}
              onChange={(e) => setRoundName(e.target.value)}
              placeholder="Round name"
              className="w-40 rounded-lg border border-surface-border bg-surface-base px-2 py-1 text-xs text-text-primary"
            />
          </div>
          <p className="mb-3 text-xs text-text-secondary">
            Select two entries to create a matchup. Entries remain available until they lose a match,
            so you can pair the same team into multiple matchups if needed. Once you&apos;ve created all
            the matchups for this round, schedule them from the Schedule tab.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {state.currentPool.map((p) => {
              const isSelected = selectedA === p.entryId || selectedB === p.entryId;
              const anchor = state.currentPool!.find((e) => e.entryId === selectedA);
              const isPotentialOpponent =
                !!anchor &&
                !isSelected &&
                (!anchor.groupName || !p.groupName || anchor.groupName !== p.groupName) &&
                !pairAlreadyExists(state.existingPairs, anchor.entryId, p.entryId);
              return (
                <button
                  key={p.entryId}
                  onClick={() => selectEntry(p.entryId)}
                  className={`flex flex-col items-start rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                    isSelected
                      ? 'border-brand-500 bg-brand-600/10 text-text-primary'
                      : isPotentialOpponent
                        ? 'border-emerald-500/70 bg-emerald-500/10 text-text-primary'
                        : 'border-surface-border bg-surface-base text-text-primary hover:border-brand-500/50'
                  }`}
                >
                  <span className="font-medium">{p.displayName}</span>
                  <span className="text-xs text-text-secondary">{p.label}{p.groupName ? ` · ${p.groupName}` : ''}</span>
                </button>
              );
            })}
          </div>

          {duplicateWarning && (
            <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
              ⚠ {duplicateWarning}
            </p>
          )}

          <div className="mt-4 flex justify-end">
            <button
              onClick={() => handleCreateMatch()}
              disabled={!selectedA || !selectedB || !!duplicateWarning || creating}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 transition-colors disabled:opacity-50"
            >
              {creating ? 'Creating…' : 'Create match'}
            </button>
          </div>
        </div>
      )}

      {/* AI assistant: suggested matchups */}
      {state.currentPool && suggestions.length > 0 && (
        <div className="rounded-lg border border-surface-border bg-surface-card p-4">
          <h2 className="mb-1 text-sm font-semibold text-text-primary">✨ AI assistant — suggested matchups</h2>
          <p className="mb-3 text-xs text-text-secondary">
            Pairings avoid same-group opponents and matches already scheduled this stage.
          </p>
          <div className="space-y-2">
            {suggestions.map(([a, b]) => (
              <div key={`${a.entryId}-${b.entryId}`} className="flex items-center justify-between gap-3 rounded-lg border border-surface-border bg-surface-base px-3 py-2 text-sm">
                <span className="text-text-primary">
                  <span className="font-medium">{a.displayName}</span>
                  <span className="text-text-secondary"> vs </span>
                  <span className="font-medium">{b.displayName}</span>
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setSelectedA(a.entryId); setSelectedB(b.entryId); setError(null); }}
                    className="text-xs text-brand-400 hover:underline"
                  >
                    Select
                  </button>
                  <button
                    onClick={() => handleCreateMatch(a.entryId, b.entryId)}
                    disabled={creating}
                    className="rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-500 transition-colors disabled:opacity-50"
                  >
                    Create
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
