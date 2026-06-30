'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getTieLineupContext, submitTieLineupAsManagerAction } from '@/lib/actions/teams';

interface Props {
  tieId: string;
}

interface RosterPlayer { id: string; full_name: string }
interface MatchRow {
  id: string;
  rubber_sequence: number | null;
  is_decider: boolean;
  status: string;
  entry_a: { player_id: string; partner_id: string | null } | null;
  entry_b: { player_id: string; partner_id: string | null } | null;
}
interface LineupContext {
  tieId: string;
  tieStatus: string;
  rubberLineup: { sequence: number; name: string; play_format: string }[];
  teamA: { id: string; name: string; roster: RosterPlayer[] } | null;
  teamB: { id: string; name: string; roster: RosterPlayer[] } | null;
  matches: MatchRow[];
}

const selectClass = 'rounded border border-slate-600 bg-surface px-2 py-1 text-xs text-white outline-none cursor-pointer';

function nameOf(roster: RosterPlayer[], id: string | null | undefined): string {
  if (!id) return '—';
  return roster.find((p) => p.id === id)?.full_name ?? '—';
}

/** Organizer-facing equivalent of TieLineupForm — lets an admin fill in
 *  either team's rubber lineup directly from the Registrations page, instead
 *  of waiting for each captain to submit their own through the app. */
export function AdminTieLineupForm({ tieId }: Props) {
  const router = useRouter();
  const [ctx, setCtx] = useState<LineupContext | 'error' | null>(null);
  const [picksA, setPicksA] = useState<Record<number, { player_id: string; partner_id: string }>>({});
  const [picksB, setPicksB] = useState<Record<number, { player_id: string; partner_id: string }>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const result = await getTieLineupContext(tieId);
      if (!active) return;
      if ('error' in result) { setCtx('error'); return; }
      const c = result as LineupContext;
      setCtx(c);

      const initialA: Record<number, { player_id: string; partner_id: string }> = {};
      const initialB: Record<number, { player_id: string; partner_id: string }> = {};
      for (const rubber of c.rubberLineup) {
        const match = c.matches.find((m) => m.rubber_sequence === rubber.sequence && !m.is_decider);
        initialA[rubber.sequence] = { player_id: match?.entry_a?.player_id ?? '', partner_id: match?.entry_a?.partner_id ?? '' };
        initialB[rubber.sequence] = { player_id: match?.entry_b?.player_id ?? '', partner_id: match?.entry_b?.partner_id ?? '' };
      }
      setPicksA(initialA);
      setPicksB(initialB);
    })();
    return () => { active = false; };
  }, [tieId]);

  if (ctx === null) return <p className="px-4 py-3 text-xs text-slate-500">Loading lineup…</p>;
  if (ctx === 'error' || !ctx.teamA || !ctx.teamB) return null;

  async function handleSubmit() {
    setSaving(true);
    setError(null);
    setSuccess(null);

    const c = ctx as LineupContext;
    const editableRubbers = c.rubberLineup.filter((r) => {
      const match = c.matches.find((m) => m.rubber_sequence === r.sequence && !m.is_decider);
      return match?.status === 'scheduled';
    });

    const lineupA = editableRubbers.map((r) => ({
      rubber_sequence: r.sequence,
      player_id: picksA[r.sequence]?.player_id ?? '',
      partner_id: picksA[r.sequence]?.partner_id || undefined,
    }));
    const lineupB = editableRubbers.map((r) => ({
      rubber_sequence: r.sequence,
      player_id: picksB[r.sequence]?.player_id ?? '',
      partner_id: picksB[r.sequence]?.partner_id || undefined,
    }));

    if (lineupA.some((l) => !l.player_id) || lineupB.some((l) => !l.player_id)) {
      setError('Pick a player for both teams in every rubber before submitting.');
      setSaving(false);
      return;
    }

    const result = await submitTieLineupAsManagerAction(tieId, lineupA, lineupB);
    if ('error' in result) setError(result.error);
    else { setSuccess('Lineup saved.'); router.refresh(); }
    setSaving(false);
  }

  function TeamColumn({ team, picks, setPicks }: {
    team: { id: string; name: string; roster: RosterPlayer[] };
    picks: Record<number, { player_id: string; partner_id: string }>;
    setPicks: React.Dispatch<React.SetStateAction<Record<number, { player_id: string; partner_id: string }>>>;
  }) {
    const c = ctx as LineupContext;
    return (
      <div className="flex-1 min-w-0 space-y-2">
        <p className="text-xs font-semibold text-slate-300">{team.name}</p>
        {c.rubberLineup.map((rubber) => {
          const match = c.matches.find((m) => m.rubber_sequence === rubber.sequence && !m.is_decider);
          const locked = match?.status !== 'scheduled';
          const needsPartner = rubber.play_format === 'doubles' || rubber.play_format === 'mixed_doubles';

          return (
            <div key={rubber.sequence} className="text-xs">
              <span className="block mb-1 text-slate-500">{rubber.name}</span>
              {locked ? (
                <span className="text-slate-500">
                  {nameOf(team.roster, picks[rubber.sequence]?.player_id)}
                  {picks[rubber.sequence]?.partner_id && ` / ${nameOf(team.roster, picks[rubber.sequence]?.partner_id)}`}
                  {' '}(locked)
                </span>
              ) : (
                <div className="flex items-center gap-2">
                  <select
                    value={picks[rubber.sequence]?.player_id ?? ''}
                    onChange={(e) => setPicks((p) => ({ ...p, [rubber.sequence]: { ...p[rubber.sequence], player_id: e.target.value } }))}
                    className={`${selectClass} flex-1 min-w-0`}
                  >
                    <option value="">Choose player…</option>
                    {team.roster.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                  </select>
                  {needsPartner && (
                    <select
                      value={picks[rubber.sequence]?.partner_id ?? ''}
                      onChange={(e) => setPicks((p) => ({ ...p, [rubber.sequence]: { ...p[rubber.sequence], partner_id: e.target.value } }))}
                      className={`${selectClass} flex-1 min-w-0`}
                    >
                      <option value="">Choose partner…</option>
                      {team.roster.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                    </select>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="border-t border-surface-border px-4 py-3 space-y-3 bg-surface/60">
      <div className="flex flex-col gap-5 sm:flex-row">
        <TeamColumn team={ctx.teamA} picks={picksA} setPicks={setPicksA} />
        <TeamColumn team={ctx.teamB} picks={picksB} setPicks={setPicksB} />
      </div>

      <button
        onClick={handleSubmit}
        disabled={saving}
        className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save lineup'}
      </button>

      {error && <p className="text-xs text-red-400">{error}</p>}
      {success && <p className="text-xs text-accent-400">{success}</p>}
    </div>
  );
}
