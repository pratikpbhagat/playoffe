'use client';

import { useState } from 'react';
import type { TieWithTeams } from '@/lib/actions/draws';

interface Props {
  ties: TieWithTeams[];
}

const STATUS_LABEL: Record<string, string> = {
  pending_lineups: 'Awaiting lineups',
  scheduled: 'Scheduled',
  in_progress: 'In progress',
  completed: 'Completed',
};

export function TeamBracketView({ ties }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (ties.length === 0) return null;

  const knockoutTies = ties.filter((t) => t.group_name === null);
  const rounds = [...new Set(knockoutTies.map((t) => t.round))].sort((a, b) => a - b);

  if (rounds.length === 0) return null;

  function toggle(tieId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(tieId)) next.delete(tieId); else next.add(tieId);
      return next;
    });
  }

  return (
    <section className="mt-8">
      <h3 className="mb-3 text-sm font-semibold text-slate-400 uppercase tracking-wide">Bracket</h3>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {rounds.map((round) => {
          const roundTies = knockoutTies.filter((t) => t.round === round);
          return (
            <div key={round} className="flex flex-col gap-3 min-w-[260px]">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
                {roundTies[0]?.round_name ?? `Round ${round}`}
              </p>
              {roundTies.map((tie) => {
                const isExpanded = expanded.has(tie.id);
                const aName = tie.team_a?.name ?? 'TBD';
                const bName = tie.team_b?.name ?? (tie.team_a ? 'Bye' : 'TBD');
                return (
                  <div key={tie.id} className="rounded-xl bg-surface-card ring-1 ring-surface-border overflow-hidden">
                    <button
                      onClick={() => toggle(tie.id)}
                      className="w-full px-4 py-3 text-left hover:bg-surface-border/40 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-sm font-medium ${tie.winner_team_id === tie.team_a?.id ? 'text-white' : 'text-slate-400'}`}>
                          {aName}
                        </span>
                        <span className="text-sm font-bold text-slate-300">{tie.rubbers_won_a}</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between">
                        <span className={`text-sm font-medium ${tie.winner_team_id === tie.team_b?.id ? 'text-white' : 'text-slate-400'}`}>
                          {bName}
                        </span>
                        <span className="text-sm font-bold text-slate-300">{tie.rubbers_won_b}</span>
                      </div>
                      <p className="mt-1.5 text-[11px] text-slate-500">{STATUS_LABEL[tie.status] ?? tie.status}</p>
                    </button>

                    {isExpanded && tie.rubbers.length > 0 && (
                      <div className="border-t border-surface-border px-4 py-2 space-y-1.5 bg-surface/40">
                        {tie.rubbers.map((r) => (
                          <div key={r.id} className="flex items-center justify-between text-xs">
                            <span className="text-slate-400">
                              {r.entry_a?.player_name ?? '—'}{r.entry_a?.partner_name ? ` / ${r.entry_a.partner_name}` : ''}
                              {' vs '}
                              {r.entry_b?.player_name ?? '—'}{r.entry_b?.partner_name ? ` / ${r.entry_b.partner_name}` : ''}
                            </span>
                            <span className={`font-medium ${r.status === 'completed' || r.status === 'walkover' ? 'text-slate-300' : 'text-slate-600'}`}>
                              {r.status === 'completed' || r.status === 'walkover' ? '✓' : '…'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </section>
  );
}
