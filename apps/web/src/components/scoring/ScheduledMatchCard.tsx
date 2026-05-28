'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { assignMatchDetailsAction } from '@/lib/actions/scoring';
import { LiveScoreDisplay } from '@/components/scoring/LiveScoreDisplay';
import { useActiveReferees } from '@/components/scoring/ActiveRefereesContext';

interface ActiveReferee {
  id: string;
  referee_name: string;
}

interface MatchEntry {
  id: string;
  seed: number | null;
  players: { full_name: string } | null;
  partner: { full_name: string } | null;
}

interface Props {
  matchId: string;
  tournamentSlug: string;
  /** 'scheduled' = not yet started; 'in_progress' = live but paused for re-assignment */
  status: 'scheduled' | 'in_progress';
  /** True when an in_progress match has been paused by the referee for re-assignment */
  pausedForReassignment?: boolean;
  /**
   * For paused matches: last known sets from the server. LiveScoreDisplay will
   * subscribe to realtime and update this as the referee's auto-saves arrive.
   */
  initialSets?: { score_a: number; score_b: number }[];
  categoryName: string;
  roundLabel: string;
  groupName: string | null;
  scheduledTime: string | null;
  court: number | null;
  assignedRefereeName: string | null;
  maxCourts: number;
  entryA: MatchEntry | null;
  entryB: MatchEntry | null;
  playFormat: string;
  activeReferees: ActiveReferee[];
}

function teamName(entry: MatchEntry | null, playFormat: string): string {
  if (!entry?.players) return 'TBD';
  const isDoubles = playFormat === 'doubles' || playFormat === 'mixed_doubles';
  if (isDoubles && entry.partner) return `${entry.players.full_name} / ${entry.partner.full_name}`;
  return entry.players.full_name;
}

export function ScheduledMatchCard({
  matchId,
  tournamentSlug,
  status,
  pausedForReassignment = false,
  initialSets,
  categoryName,
  roundLabel,
  groupName,
  scheduledTime,
  court,
  assignedRefereeName,
  maxCourts,
  entryA,
  entryB,
  playFormat,
  activeReferees,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [courtVal, setCourtVal] = useState<string>(court ? String(court) : '');
  const [referee, setReferee] = useState<string>(assignedRefereeName ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Live referee list from context (updated in real-time as referees check in).
  // Falls back to the server-rendered prop when not inside a provider.
  const contextReferees = useActiveReferees();
  const liveReferees = contextReferees.length > 0 ? contextReferees : activeReferees;

  // Sync local state when server props update (e.g. after router.refresh())
  // Without this, the dropdowns show stale values after a re-assignment.
  useEffect(() => {
    setCourtVal(court ? String(court) : '');
    setReferee(assignedRefereeName ?? '');
    setSaved(false);
    setError(null);
  }, [matchId, court, assignedRefereeName]);

  const aName = teamName(entryA, playFormat);
  const bName = teamName(entryB, playFormat);

  // Determine which button label to show
  const hasAssignment = !!court && !!assignedRefereeName;
  const isReassign = hasAssignment || pausedForReassignment;
  const buttonLabel = saved ? '✓ Saved' : isPending ? 'Saving…' : isReassign ? 'Re-assign' : 'Assign';

  function handleAssign() {
    const courtNum = courtVal ? parseInt(courtVal, 10) : null;
    if (!courtVal || !courtNum || isNaN(courtNum)) {
      setError('Select a court before assigning.');
      return;
    }
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await assignMatchDetailsAction(
        matchId,
        courtNum,
        referee || null,
      );
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
    <div className={`rounded-xl ring-1 overflow-hidden ${
      pausedForReassignment
        ? 'bg-amber-950/20 ring-amber-700/40'
        : 'bg-surface-card ring-surface-border'
    }`}>
      {/* Paused banner — shows live score so admin can see last saved state */}
      {pausedForReassignment && (
        <div className="flex items-center justify-between gap-3 border-b border-amber-800/30 bg-amber-900/20 px-5 py-2">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
            <p className="text-xs font-semibold text-amber-400">
              ⏸ Paused — referee requested re-assignment
            </p>
          </div>
          {initialSets && (
            <LiveScoreDisplay
              matchId={matchId}
              initialSets={initialSets}
              className="text-sm font-mono font-bold text-amber-300 shrink-0"
            />
          )}
        </div>
      )}

      {/* Match header — link to detail */}
      <Link
        href={`/tournaments/${tournamentSlug}/scoring/${matchId}`}
        className="flex items-start gap-4 px-5 py-4 hover:bg-white/[0.02] transition-colors group"
      >
        <div className="w-14 shrink-0 text-center space-y-1 pt-0.5">
          {scheduledTime && !pausedForReassignment && (
            <p className="text-xs font-mono text-slate-400">
              {new Date(scheduledTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
          {court && (
            <span className={`block rounded px-2 py-0.5 text-[11px] font-mono ${
              pausedForReassignment ? 'bg-amber-900/30 text-amber-500' : 'bg-surface text-slate-500'
            }`}>
              Ct {court}
            </span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">
            {aName}
            <span className="mx-2 text-slate-500 font-normal">vs</span>
            {bName}
          </p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <p className="text-xs text-slate-500 truncate">
              {categoryName}
              {roundLabel ? ` · ${roundLabel}` : ''}
              {groupName ? ` · ${groupName}` : ''}
            </p>
            {assignedRefereeName && (
              <span className="text-[11px] text-slate-600">
                Ref: <span className="text-slate-500">{assignedRefereeName}</span>
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <span className="text-xs text-brand-400 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
            Score →
          </span>
          <span className="text-slate-600 group-hover:text-slate-400 transition-colors text-sm">›</span>
        </div>
      </Link>

      {/* Assignment controls */}
      <div className={`border-t px-5 py-3 flex flex-wrap items-center gap-3 ${
        pausedForReassignment
          ? 'border-amber-800/30 bg-amber-900/10'
          : 'border-surface-border/60 bg-black/10'
      }`}>
        {/* Court picker */}
        <div className="flex items-center gap-2">
          <label className="text-[11px] text-slate-500 shrink-0 font-medium">Court</label>
          <select
            value={courtVal}
            onChange={(e) => { setCourtVal(e.target.value); setSaved(false); setError(null); }}
            className={`rounded-lg border bg-surface px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none ${
              pausedForReassignment
                ? 'border-amber-700/50 focus:border-amber-500'
                : 'border-slate-700 focus:border-brand-500'
            }`}
          >
            <option value="">— select —</option>
            {courtOptions.map((c) => (
              <option key={c} value={c}>Court {c}</option>
            ))}
          </select>
        </div>

        {/* Referee picker */}
        <div className="flex items-center gap-2 flex-1 min-w-[160px]">
          <label className="text-[11px] text-slate-500 shrink-0 font-medium">Referee</label>
          {liveReferees.length > 0 ? (
            <select
              value={referee}
              onChange={(e) => { setReferee(e.target.value); setSaved(false); }}
              className={`flex-1 rounded-lg border bg-surface px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none ${
                pausedForReassignment
                  ? 'border-amber-700/50 focus:border-amber-500'
                  : 'border-slate-700 focus:border-brand-500'
              }`}
            >
              <option value="">— none —</option>
              {liveReferees.map((r) => (
                <option key={r.id} value={r.referee_name}>{r.referee_name}</option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={referee}
              onChange={(e) => { setReferee(e.target.value); setSaved(false); }}
              placeholder="Name (optional)"
              className={`flex-1 rounded-lg border bg-surface px-2.5 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none ${
                pausedForReassignment
                  ? 'border-amber-700/50 focus:border-amber-500'
                  : 'border-slate-700 focus:border-brand-500'
              }`}
            />
          )}
        </div>

        {/* Assign / Re-assign button */}
        <button
          onClick={handleAssign}
          disabled={isPending}
          className={`shrink-0 flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
            saved
              ? 'bg-accent-500/20 text-accent-400 ring-1 ring-accent-500/30'
              : pausedForReassignment
              ? 'bg-amber-600 text-white hover:bg-amber-700'
              : isReassign
              ? 'border border-slate-600 text-slate-300 hover:border-slate-400 hover:text-white'
              : 'bg-brand-600 text-white hover:bg-brand-700'
          }`}
        >
          {buttonLabel}
        </button>
      </div>

      {error && (
        <p className="px-5 pb-3 text-xs text-red-400">{error}</p>
      )}
    </div>
  );
}
