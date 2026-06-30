'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { assignTieDetailsAction } from '@/lib/actions/scoring';
import { useActiveReferees } from '@/components/scoring/ActiveRefereesContext';

interface ActiveReferee {
  id: string;
  referee_name: string;
}

interface RubberRow {
  id: string;
  label: string;
  isPlaceholder?: boolean;
  /** Player names for this rubber (or partner pairs) — shown once a lineup
   *  is in, whether submitted manually or applied from a team's default. */
  playerA?: string;
  playerB?: string;
}

interface Props {
  tieId: string;
  teamAName: string;
  teamBName: string;
  categoryName: string;
  roundLabel: string;
  groupName: string | null;
  rubbers: RubberRow[];
  court: number | null;
  assignedRefereeName: string | null;
  maxCourts: number;
  activeReferees: ActiveReferee[];
}

/** A team-event tie's rubbers always play on the same court, back-to-back —
 *  so rather than one assignment card per rubber, this groups all of a tie's
 *  not-yet-started rubbers into a single court/referee picker. The referee
 *  still sees and scores each rubber as its own match on their dashboard;
 *  this is purely an organiser-side shortcut for assignment. */
export function TieAssignmentCard({
  tieId, teamAName, teamBName, categoryName, roundLabel, groupName,
  rubbers, court, assignedRefereeName, maxCourts, activeReferees,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [courtVal, setCourtVal] = useState<string>(court ? String(court) : '');
  const [referee, setReferee] = useState<string>(assignedRefereeName ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const contextReferees = useActiveReferees();
  const liveReferees = contextReferees.length > 0 ? contextReferees : activeReferees;

  useEffect(() => {
    setCourtVal(court ? String(court) : '');
    setReferee(assignedRefereeName ?? '');
    setSaved(false);
    setError(null);
  }, [tieId, court, assignedRefereeName]);

  const hasAssignment = !!court && !!assignedRefereeName;
  const buttonLabel = saved ? '✓ Saved' : isPending ? 'Saving…' : hasAssignment ? 'Re-assign all' : 'Assign all';

  function handleAssign() {
    const courtNum = courtVal ? parseInt(courtVal, 10) : null;
    if (!courtVal || !courtNum || isNaN(courtNum)) {
      setError('Select a court before assigning.');
      return;
    }
    if (!referee) {
      setError('Select a referee before assigning.');
      return;
    }
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await assignTieDetailsAction(tieId, courtNum, referee || null);
      if (result?.error) {
        setError(result.error);
      } else {
        setSaved(true);
        router.refresh();
        setTimeout(() => setSaved(false), 2000);
      }
    });
  }

  const courtOptions = Array.from({ length: maxCourts }, (_, i) => i + 1);

  return (
    <div className="rounded-xl bg-surface-card ring-1 ring-surface-border overflow-hidden">
      {/* Tie header */}
      <div className="px-5 py-4">
        <p className="text-sm font-semibold text-white truncate">
          {teamAName}
          <span className="mx-2 text-slate-500 font-normal">vs</span>
          {teamBName}
        </p>
        <p className="text-xs text-slate-500 mt-0.5 truncate">
          {categoryName}
          {roundLabel ? ` · ${roundLabel}` : ''}
          {groupName ? ` · ${groupName}` : ''}
        </p>

        {/* Rubber list — shows the actual lineup once it's set (submitted by
            the captain, or applied from a team's saved default), otherwise
            just the rubber name + an "awaiting lineup" note. */}
        <div className="mt-3 space-y-1">
          {rubbers.map((r) => (
            <div key={r.id} className="flex items-center justify-between text-xs gap-2">
              <span className="text-slate-500 shrink-0">{r.label}</span>
              {r.isPlaceholder ? (
                <span className="text-slate-600">Awaiting lineup</span>
              ) : (
                <span className="text-slate-300 text-right truncate">
                  {r.playerA || 'TBD'} <span className="text-slate-600">vs</span> {r.playerB || 'TBD'}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Assignment controls — applies to every rubber listed above at once */}
      <div className="border-t border-surface-border/60 bg-black/10 px-5 py-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-[11px] text-slate-500 shrink-0 font-medium">Court</label>
          <select
            value={courtVal}
            onChange={(e) => { setCourtVal(e.target.value); setSaved(false); setError(null); }}
            className="rounded-lg border border-slate-700 bg-surface px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
          >
            <option value="">— select —</option>
            {courtOptions.map((c) => (
              <option key={c} value={c}>Court {c}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 flex-1 min-w-[160px]">
          <label className="text-[11px] text-slate-500 shrink-0 font-medium">Referee</label>
          <select
            value={referee}
            onChange={(e) => { setReferee(e.target.value); setSaved(false); }}
            className="flex-1 rounded-lg border border-slate-700 bg-surface px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
          >
            <option value="">— none —</option>
            {liveReferees.map((r) => (
              <option key={r.id} value={r.referee_name}>{r.referee_name}</option>
            ))}
          </select>
        </div>

        <button
          onClick={handleAssign}
          disabled={isPending || !courtVal || !referee}
          className={`shrink-0 flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
            saved
              ? 'bg-accent-500/20 text-accent-400 ring-1 ring-accent-500/30'
              : hasAssignment
              ? 'border border-slate-600 text-slate-300 hover:border-slate-400 hover:text-white'
              : 'bg-brand-600 text-white hover:bg-brand-700'
          }`}
        >
          {buttonLabel}
        </button>
      </div>

      {error && <p className="px-5 pb-3 text-xs text-red-400">{error}</p>}
    </div>
  );
}
