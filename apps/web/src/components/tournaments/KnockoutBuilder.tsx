'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createKnockoutMatchAction, deleteKnockoutMatchAction, getKnockoutBuilderStateAction, resetManualKnockoutAction } from '@/lib/actions/draws';
import type { KnockoutBuilderState, KnockoutPoolEntry, KnockoutStandingRow } from '@/lib/actions/draws';

function pairAlreadyExists(pairs: [string, string][], a: string, b: string): boolean {
  return pairs.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

/** Canonical knockout-stage hierarchy, earliest to latest. */
const STAGE_HIERARCHY = ['Round of 32', 'Round of 16', 'Quarter-final', 'Semi-final', '3rd place playoff', 'Final'];

/** Given the previous stage's name, return the next stage in the hierarchy.
 *  Falls back to `fallback` if the previous name isn't recognised or is last. */
function nextStageName(previousName: string | null, fallback: string): string {
  if (!previousName) return fallback;
  const idx = STAGE_HIERARCHY.indexOf(previousName);
  if (idx === -1 || idx === STAGE_HIERARCHY.length - 1) return fallback;
  // Skip "3rd place playoff" when stepping forward automatically — it's a side
  // bracket, not the next stage of the main draw.
  for (let i = idx + 1; i < STAGE_HIERARCHY.length; i++) {
    if (STAGE_HIERARCHY[i] !== '3rd place playoff') return STAGE_HIERARCHY[i];
  }
  return fallback;
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

function previousStageName(state: KnockoutBuilderState): string | null {
  return state.rounds.length > 0 ? state.rounds[state.rounds.length - 1].roundName : null;
}

function defaultStageName(state: KnockoutBuilderState): string {
  // If the most recent round still has matches pending, keep that round's
  // name as the default — only advance to the next stage once every match
  // in the current stage has been completed.
  const lastRound = state.rounds[state.rounds.length - 1];
  if (lastRound && !lastRound.matches.every((m) => m.status === 'completed' || m.status === 'walkover')) {
    return lastRound.roundName;
  }
  return nextStageName(previousStageName(state), state.suggestedRoundName ?? '');
}

export function KnockoutBuilder({ categoryId, initialState }: Props) {
  const router = useRouter();
  const [state, setState] = useState(initialState);
  const [selectedA, setSelectedA] = useState<string | null>(null);
  const [selectedB, setSelectedB] = useState<string | null>(null);
  const [roundName, setRoundName] = useState(defaultStageName(initialState));
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
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

  const stageNameOptions = useMemo(() => {
    const used = state.rounds.map((r) => r.roundName);
    const extra = new Set<string>([...used]);
    if (state.suggestedRoundName) extra.add(state.suggestedRoundName);
    if (roundName) extra.add(roundName);
    // Hierarchy first (in order), then any other names not already covered.
    const ordered = STAGE_HIERARCHY.filter((n) => extra.has(n) || !used.includes(n));
    for (const name of extra) {
      if (!ordered.includes(name)) ordered.push(name);
    }
    return ordered;
  }, [state.rounds, state.suggestedRoundName, roundName]);
  const [customRoundName, setCustomRoundName] = useState(false);

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

  async function handleResetBracket() {
    if (!window.confirm('Remove all knockout matches created so far and start the bracket over?')) return;
    setResetting(true);
    setError(null);
    const result = await resetManualKnockoutAction(categoryId);
    if ('error' in result && result.error) {
      setError(result.error);
      setResetting(false);
      return;
    }
    router.refresh();
    await refreshState();
    setResetting(false);
  }

  const hasStartedMatch = state.rounds.some((r) => r.matches.some((m) => m.status !== 'scheduled'));
  const canResetBracket = state.rounds.length > 0 && !hasStartedMatch;

  async function refreshState() {
    const result = await getKnockoutBuilderStateAction(categoryId);
    if ('data' in result) {
      setState(result.data);
      setCustomRoundName(false);
      setRoundName(defaultStageName(result.data));
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Reset bracket */}
      {canResetBracket && (
        <div className="flex justify-end">
          <button
            onClick={handleResetBracket}
            disabled={resetting}
            className="rounded-lg border border-red-500/30 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
          >
            {resetting ? 'Resetting…' : 'Reset bracket ↺'}
          </button>
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

      {/* Cumulative knockout standings — single table, updated with every
          stage's results until the knockout is complete. */}
      {state.currentPool && state.overallStandings && (
        <div className="rounded-lg border border-surface-border bg-surface-card p-4">
          <h2 className="mb-1 text-sm font-semibold text-text-primary">Knockout standings</h2>
          <p className="mb-3 text-xs text-text-secondary">
            Cumulative results across all knockout matches played so far — use this to pick the next set of matchups from the available pool.
          </p>
          <KnockoutStandingsTable rows={state.overallStandings} />
        </div>
      )}

      {/* Builder for next round */}
      {state.currentPool && (
        <div className="rounded-lg border border-surface-border bg-surface-card p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-text-primary">
              Available pool ({state.currentPool.length})
            </h2>
            {customRoundName ? (
              <input
                type="text"
                value={roundName}
                onChange={(e) => setRoundName(e.target.value)}
                onBlur={() => { if (!roundName.trim()) setCustomRoundName(false); }}
                placeholder="Stage name"
                autoFocus
                className="w-40 rounded-lg border border-surface-border bg-surface-base px-2 py-1 text-xs text-text-primary"
              />
            ) : (
              <select
                value={roundName}
                onChange={(e) => {
                  if (e.target.value === '__custom__') {
                    setCustomRoundName(true);
                    setRoundName('');
                  } else {
                    setRoundName(e.target.value);
                  }
                }}
                className="w-40 rounded-lg border border-surface-border bg-surface-base px-2 py-1 text-xs text-text-primary"
              >
                {stageNameOptions.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
                <option value="__custom__">Custom…</option>
              </select>
            )}
          </div>
          <p className="mb-3 text-xs text-text-secondary">
            {state.rounds[state.rounds.length - 1]?.standings
              ? "Use the stage standings above to set up the next knockout round — pair each team into one matchup; the loser will be eliminated."
              : "Select two entries to create a matchup. Entries remain available until they lose a match, so you can pair the same team into multiple matchups if needed."}
            {' '}Once you&apos;ve created all the matchups for this round, schedule them from the Schedule tab.
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

function KnockoutStandingsTable({ rows }: { rows: KnockoutStandingRow[] }) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b border-surface-border text-text-secondary">
          <th className="px-2 py-1 text-left font-medium w-6">#</th>
          <th className="px-2 py-1 text-left font-medium">Team</th>
          <th className="px-2 py-1 text-center font-medium w-10" title="Knockout matches played">MP</th>
          <th className="px-2 py-1 text-center font-medium w-10">W</th>
          <th className="px-2 py-1 text-center font-medium w-10">L</th>
          <th className="px-2 py-1 text-center font-medium w-12">PS</th>
          <th className="px-2 py-1 text-center font-medium w-12">PA</th>
          <th className="px-2 py-1 text-center font-medium w-12">PD</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((s) => (
          <tr key={s.entryId} className="border-b border-surface-border last:border-0">
            <td className="px-2 py-1 text-text-secondary">{s.rank}</td>
            <td className="px-2 py-1 text-text-primary">{s.displayName}</td>
            <td className="px-2 py-1 text-center text-text-secondary">{s.played}</td>
            <td className="px-2 py-1 text-center text-text-primary">{s.wins}</td>
            <td className="px-2 py-1 text-center text-text-primary">{s.losses}</td>
            <td className="px-2 py-1 text-center text-text-secondary">{s.pointsScored}</td>
            <td className="px-2 py-1 text-center text-text-secondary">{s.pointsGiven}</td>
            <td className="px-2 py-1 text-center text-text-secondary">{s.pointDiff >= 0 ? `+${s.pointDiff}` : s.pointDiff}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
