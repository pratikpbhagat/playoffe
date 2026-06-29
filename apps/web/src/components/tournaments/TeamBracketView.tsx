'use client';

import { useState } from 'react';
import type { TieWithTeams } from '@/lib/actions/draws';
import { TieLineupForm } from './TieLineupForm';
import { walkoverTieAction, scheduleTieAction } from '@/lib/actions/teams';
import { promoteGroupWinnerTiesAction } from '@/lib/actions/draws';
import { useRouter } from 'next/navigation';

interface Props {
  ties: TieWithTeams[];
  categoryId: string;
  /** Hides organizer-only controls (walkover, scheduling, promote) on public pages. */
  isManager?: boolean;
}

const STATUS_LABEL: Record<string, string> = {
  pending_lineups: 'Awaiting lineups',
  scheduled: 'Scheduled',
  in_progress: 'In progress',
  awaiting_decider: 'Decider needed',
  completed: 'Completed',
};

function TieCard({ tie, isExpanded, onToggle, isManager }: { tie: TieWithTeams; isExpanded: boolean; onToggle: () => void; isManager: boolean }) {
  const router = useRouter();
  const aName = tie.team_a?.name ?? 'TBD';
  const bName = tie.team_b?.name ?? (tie.team_a ? 'Bye' : 'TBD');
  const [court, setCourt] = useState('');
  const [startTime, setStartTime] = useState('');
  const [scheduling, setScheduling] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  async function handleWalkover(winningTeamId: string) {
    await walkoverTieAction(tie.id, winningTeamId);
    router.refresh();
  }

  async function handleSchedule() {
    if (!court || !startTime) return;
    setScheduling(true);
    setScheduleError(null);
    const result = await scheduleTieAction(tie.id, parseInt(court, 10), new Date(startTime).toISOString());
    if (result.error) setScheduleError(result.error);
    else router.refresh();
    setScheduling(false);
  }

  return (
    <div className="rounded-xl bg-surface-card ring-1 ring-surface-border overflow-hidden">
      <button onClick={onToggle} className="w-full px-4 py-3 text-left hover:bg-surface-border/40 transition-colors">
        <div className="flex items-center justify-between">
          <span className={`text-sm font-medium ${tie.winner_team_id === tie.team_a?.id ? 'text-white' : 'text-slate-400'}`}>{aName}</span>
          <span className="text-sm font-bold text-slate-300">{tie.rubbers_won_a}</span>
        </div>
        <div className="mt-1 flex items-center justify-between">
          <span className={`text-sm font-medium ${tie.winner_team_id === tie.team_b?.id ? 'text-white' : 'text-slate-400'}`}>{bName}</span>
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

      {isManager && isExpanded && tie.status !== 'completed' && tie.team_a && tie.team_b && (
        <div className="border-t border-surface-border px-4 py-2 space-y-1.5 bg-surface/40">
          <p className="text-[11px] text-slate-500">Schedule all rubbers — same court, back-to-back:</p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              placeholder="Court"
              value={court}
              onChange={(e) => setCourt(e.target.value)}
              className="w-16 rounded border border-slate-600 bg-surface px-2 py-1 text-xs text-white outline-none"
            />
            <input
              type="datetime-local"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="rounded border border-slate-600 bg-surface px-2 py-1 text-xs text-white outline-none"
            />
            <button
              onClick={handleSchedule}
              disabled={scheduling || !court || !startTime}
              className="rounded bg-brand-600 px-2 py-1 text-xs font-medium text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
            >
              {scheduling ? 'Saving…' : 'Schedule'}
            </button>
          </div>
          {scheduleError && <p className="text-[11px] text-red-400">{scheduleError}</p>}
        </div>
      )}

      {isExpanded && tie.status !== 'completed' && <TieLineupForm tieId={tie.id} />}

      {isManager && isExpanded && tie.status !== 'completed' && tie.team_a && tie.team_b && (
        <div className="border-t border-surface-border px-4 py-2 flex items-center gap-2 bg-surface/40">
          <span className="text-[11px] text-slate-500">Walkover to:</span>
          <button onClick={() => handleWalkover(tie.team_a!.id)} className="text-[11px] text-amber-400 hover:text-amber-300 transition-colors">{aName}</button>
          <span className="text-slate-600">·</span>
          <button onClick={() => handleWalkover(tie.team_b!.id)} className="text-[11px] text-amber-400 hover:text-amber-300 transition-colors">{bName}</button>
        </div>
      )}
    </div>
  );
}

export function TeamBracketView({ ties, categoryId, isManager = true }: Props) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [promoting, setPromoting] = useState(false);
  const [promoteError, setPromoteError] = useState<string | null>(null);

  if (ties.length === 0) return null;

  const knockoutTies = ties.filter((t) => t.group_name === null);
  const groupTies = ties.filter((t) => t.group_name !== null);
  const rounds = [...new Set(knockoutTies.map((t) => t.round))].sort((a, b) => a - b);
  const groupNames = [...new Set(groupTies.map((t) => t.group_name!))].sort();

  if (rounds.length === 0 && groupNames.length === 0) return null;

  function toggle(tieId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(tieId)) next.delete(tieId); else next.add(tieId);
      return next;
    });
  }

  const allGroupTiesDone = groupTies.length > 0 && groupTies.every((t) => t.status === 'completed');
  const firstKnockoutRound = rounds.length > 0 ? rounds[0] : null;
  const firstRoundKnockoutTies = knockoutTies.filter((t) => t.round === firstKnockoutRound);
  const knockoutSlotsEmpty = firstRoundKnockoutTies.length > 0 && firstRoundKnockoutTies.every((t) => !t.team_a && !t.team_b);
  const canPromoteGroups = groupNames.length > 0 && allGroupTiesDone && knockoutSlotsEmpty;

  async function handlePromoteGroups() {
    setPromoting(true);
    setPromoteError(null);
    const result = await promoteGroupWinnerTiesAction(categoryId);
    if ('error' in result && result.error) {
      setPromoteError(result.error);
      setPromoting(false);
    } else {
      router.refresh();
    }
  }

  return (
    <>
      {groupNames.length > 0 && (
        <section className="mt-8">
          <h3 className="mb-3 text-sm font-semibold text-slate-400 uppercase tracking-wide">Group ties</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {groupNames.map((groupName) => (
              <div key={groupName} className="flex flex-col gap-3">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{groupName}</p>
                {groupTies.filter((t) => t.group_name === groupName).map((tie) => (
                  <TieCard key={tie.id} tie={tie} isExpanded={expanded.has(tie.id)} onToggle={() => toggle(tie.id)} isManager={isManager} />
                ))}
              </div>
            ))}
          </div>
        </section>
      )}

      {rounds.length > 0 && (
        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Bracket</h3>
            {isManager && canPromoteGroups && (
              <button
                onClick={handlePromoteGroups}
                disabled={promoting}
                className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
              >
                {promoting ? 'Promoting…' : 'Promote group winners →'}
              </button>
            )}
          </div>
          {promoteError && <p className="mb-2 text-xs text-red-400">{promoteError}</p>}
          <div className="flex gap-4 overflow-x-auto pb-2">
            {rounds.map((round) => {
              const roundTies = knockoutTies.filter((t) => t.round === round);
              return (
                <div key={round} className="flex flex-col gap-3 min-w-[260px]">
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
                    {roundTies[0]?.round_name ?? `Round ${round}`}
                  </p>
                  {roundTies.map((tie) => (
                    <TieCard key={tie.id} tie={tie} isExpanded={expanded.has(tie.id)} onToggle={() => toggle(tie.id)} isManager={isManager} />
                  ))}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}
