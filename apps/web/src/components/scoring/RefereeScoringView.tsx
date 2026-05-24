'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { scoreMatchAsRefereeAction } from '@/lib/actions/referee';

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
  entry_a: Entry | null;
  entry_b: Entry | null;
}

interface Props {
  matches: Match[];
  pin: string;
  tournamentSlug: string;
}

function entryLabel(e: Entry | null) {
  if (!e) return 'TBD';
  return e.partner_name ? `${e.player_name} / ${e.partner_name}` : e.player_name;
}

export function RefereeScoringView({ matches, pin, tournamentSlug: _slug }: Props) {
  const router = useRouter();
  const [activeMatch, setActiveMatch] = useState<string | null>(null);
  const [sets, setSets] = useState<{ score_a: number; score_b: number }[]>([{ score_a: 0, score_b: 0 }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());

  function openMatch(matchId: string, existingSets: { score_a: number; score_b: number }[]) {
    setActiveMatch(matchId);
    setSets(existingSets.length > 0 ? existingSets : [{ score_a: 0, score_b: 0 }]);
    setError(null);
  }

  function addSet() {
    setSets((s) => [...s, { score_a: 0, score_b: 0 }]);
  }
  function removeSet(i: number) {
    setSets((s) => s.filter((_, idx) => idx !== i));
  }
  function updateSet(i: number, field: 'score_a' | 'score_b', val: number) {
    setSets((s) => s.map((set, idx) => idx === i ? { ...set, [field]: Math.max(0, val) } : set));
  }

  function determineWinner(match: Match): string | null {
    if (sets.length === 0) return null;
    const aWins = sets.filter((s) => s.score_a > s.score_b).length;
    const bWins = sets.filter((s) => s.score_b > s.score_a).length;
    if (aWins > bWins) return match.entry_a?.id ?? null;
    if (bWins > aWins) return match.entry_b?.id ?? null;
    return null;
  }

  async function handleSubmit(match: Match) {
    const winnerId = determineWinner(match);
    if (!winnerId) { setError('Result is tied — check your scores.'); return; }
    setSubmitting(true);
    const result = await scoreMatchAsRefereeAction(match.id, pin, sets, winnerId);
    if (result.error) {
      setError(result.error);
    } else {
      setDone((d) => new Set([...d, match.id]));
      setActiveMatch(null);
      router.refresh();
    }
    setSubmitting(false);
  }

  // Group by court
  const byCourt = new Map<string, Match[]>();
  for (const m of matches) {
    const key = m.court != null ? `Court ${m.court}` : 'Unassigned';
    if (!byCourt.has(key)) byCourt.set(key, []);
    byCourt.get(key)!.push(m);
  }

  if (matches.length === 0) {
    return (
      <div className="rounded-xl bg-surface-card p-10 text-center ring-1 ring-surface-border">
        <p className="text-2xl mb-2">✅</p>
        <p className="text-sm font-medium text-white">No active matches</p>
        <p className="mt-1 text-xs text-slate-500">All scheduled matches are complete or not yet started.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {[...byCourt.entries()].map(([courtLabel, courtMatches]) => (
        <section key={courtLabel}>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">{courtLabel}</h2>
          <div className="space-y-3">
            {courtMatches.map((m) => {
              const isOpen = activeMatch === m.id;
              const isDone = done.has(m.id);
              const context = m.group_name ? `${m.group_name}` : m.round_name ?? `Round ${m.round}`;

              return (
                <div
                  key={m.id}
                  className={`rounded-xl bg-surface-card ring-1 transition-all ${
                    isDone ? 'ring-accent-500/40' : isOpen ? 'ring-brand-500/60' : 'ring-surface-border'
                  }`}
                >
                  {/* Match header */}
                  <button
                    className="w-full text-left px-5 py-4"
                    onClick={() => {
                      if (isDone) return;
                      isOpen ? setActiveMatch(null) : openMatch(m.id, m.sets);
                    }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-slate-500 mb-1">{context}</p>
                        <div className="space-y-0.5">
                          <p className={`text-sm font-semibold truncate ${isDone ? 'text-slate-400' : 'text-white'}`}>
                            {entryLabel(m.entry_a)}
                          </p>
                          <p className="text-xs text-slate-500">vs</p>
                          <p className={`text-sm font-semibold truncate ${isDone ? 'text-slate-400' : 'text-white'}`}>
                            {entryLabel(m.entry_b)}
                          </p>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        {isDone ? (
                          <span className="text-accent-400 text-sm">✓ Done</span>
                        ) : (
                          <span className={`text-xs ${isOpen ? 'text-brand-400' : 'text-slate-600'}`}>
                            {isOpen ? 'Close ↑' : 'Score →'}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>

                  {/* Score entry panel */}
                  {isOpen && !isDone && (
                    <div className="border-t border-surface-border px-5 pb-5 pt-4 space-y-4">
                      {/* Set rows */}
                      {sets.map((set, i) => (
                        <div key={i} className="space-y-2">
                          <p className="text-xs text-slate-500">Set {i + 1}</p>
                          <div className="flex items-center gap-3">
                            <div className="flex-1">
                              <p className="text-[10px] text-slate-600 mb-1 truncate">{entryLabel(m.entry_a)}</p>
                              <input
                                type="number"
                                min={0}
                                max={99}
                                value={set.score_a}
                                onChange={(e) => updateSet(i, 'score_a', parseInt(e.target.value) || 0)}
                                className="w-full rounded-lg border border-slate-700 bg-surface px-3 py-3 text-center text-lg font-bold text-white focus:border-brand-500 focus:outline-none"
                              />
                            </div>
                            <span className="text-slate-600 font-bold text-sm pt-5">–</span>
                            <div className="flex-1">
                              <p className="text-[10px] text-slate-600 mb-1 truncate">{entryLabel(m.entry_b)}</p>
                              <input
                                type="number"
                                min={0}
                                max={99}
                                value={set.score_b}
                                onChange={(e) => updateSet(i, 'score_b', parseInt(e.target.value) || 0)}
                                className="w-full rounded-lg border border-slate-700 bg-surface px-3 py-3 text-center text-lg font-bold text-white focus:border-brand-500 focus:outline-none"
                              />
                            </div>
                            {sets.length > 1 && (
                              <button
                                onClick={() => removeSet(i)}
                                className="pt-5 text-slate-600 hover:text-red-400 transition-colors text-xs"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        </div>
                      ))}

                      {/* Add set */}
                      <button
                        onClick={addSet}
                        className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                      >
                        + Add set
                      </button>

                      {/* Winner indicator */}
                      {(() => {
                        const wId = determineWinner(m);
                        const winner = wId === m.entry_a?.id ? m.entry_a : wId === m.entry_b?.id ? m.entry_b : null;
                        return winner ? (
                          <p className="text-xs text-accent-400">
                            🏆 Winner: <strong>{entryLabel(winner)}</strong>
                          </p>
                        ) : null;
                      })()}

                      {error && <p className="text-sm text-red-400">{error}</p>}

                      <div className="flex gap-3 pt-1">
                        <button
                          onClick={() => handleSubmit(m)}
                          disabled={submitting || !determineWinner(m)}
                          className="flex-1 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-40"
                        >
                          {submitting ? 'Saving…' : 'Submit result'}
                        </button>
                        <button
                          onClick={() => setActiveMatch(null)}
                          className="rounded-xl border border-surface-border px-4 py-3 text-sm text-slate-400 hover:text-slate-300 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
