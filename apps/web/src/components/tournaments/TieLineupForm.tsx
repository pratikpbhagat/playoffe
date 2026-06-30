'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getTieLineupContext, submitTieLineupAction, submitDeciderLineupAction } from '@/lib/actions/teams';

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
  lineupASubmitted: boolean;
  lineupBSubmitted: boolean;
  rubberLineup: { sequence: number; name: string; play_format: string }[];
  deciderFormat: 'singles' | 'doubles' | null;
  teamA: { id: string; name: string; roster: RosterPlayer[] } | null;
  teamB: { id: string; name: string; roster: RosterPlayer[] } | null;
  mySide: 'a' | 'b' | null;
  matches: MatchRow[];
}

const selectClass = 'rounded border border-slate-600 bg-surface px-2 py-1 text-xs text-white outline-none cursor-pointer';

function nameOf(roster: RosterPlayer[], id: string | null | undefined): string {
  if (!id) return '—';
  return roster.find((p) => p.id === id)?.full_name ?? '—';
}

export function TieLineupForm({ tieId }: Props) {
  const router = useRouter();
  const [ctx, setCtx] = useState<LineupContext | 'error' | null>(null);
  const [picks, setPicks] = useState<Record<number, { player_id: string; partner_id: string }>>({});
  const [deciderPick, setDeciderPick] = useState<{ player_id: string; partner_id: string }>({ player_id: '', partner_id: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const result = await getTieLineupContext(tieId);
      if (!active) return;
      if ('error' in result) { setCtx('error'); return; }
      setCtx(result as LineupContext);

      const initial: Record<number, { player_id: string; partner_id: string }> = {};
      for (const rubber of (result as LineupContext).rubberLineup) {
        const match = (result as LineupContext).matches.find((m) => m.rubber_sequence === rubber.sequence && !m.is_decider);
        const mySide = (result as LineupContext).mySide;
        const entry = mySide === 'a' ? match?.entry_a : mySide === 'b' ? match?.entry_b : null;
        initial[rubber.sequence] = { player_id: entry?.player_id ?? '', partner_id: entry?.partner_id ?? '' };
      }
      setPicks(initial);
    })();
    return () => { active = false; };
  }, [tieId]);

  if (ctx === null) return <p className="px-4 py-3 text-xs text-slate-500">Loading lineup…</p>;
  if (ctx === 'error' || !ctx.mySide || !ctx.teamA || !ctx.teamB) return null;

  const myTeam = ctx.mySide === 'a' ? ctx.teamA : ctx.teamB;
  const oppTeam = ctx.mySide === 'a' ? ctx.teamB : ctx.teamA;
  const oppRoster = oppTeam.roster;

  async function handleSubmit() {
    setSaving(true);
    setError(null);
    setSuccess(null);
    const lineup = ctx2().rubberLineup
      .filter((r) => {
        const match = ctx2().matches.find((m) => m.rubber_sequence === r.sequence && !m.is_decider);
        return match?.status === 'scheduled';
      })
      .map((r) => ({
        rubber_sequence: r.sequence,
        player_id: picks[r.sequence]?.player_id ?? '',
        partner_id: picks[r.sequence]?.partner_id || undefined,
      }));

    if (lineup.some((l) => !l.player_id)) {
      setError('Pick a player for every rubber before submitting.');
      setSaving(false);
      return;
    }

    const result = await submitTieLineupAction(tieId, lineup);
    if ('error' in result) setError(result.error);
    else { setSuccess('Lineup submitted.'); router.refresh(); }
    setSaving(false);
  }

  function ctx2(): LineupContext {
    return ctx as LineupContext;
  }

  async function handleDeciderSubmit() {
    setSaving(true);
    setError(null);
    setSuccess(null);
    const result = await submitDeciderLineupAction(tieId, deciderPick.player_id, deciderPick.partner_id || undefined);
    if (result.error) setError(result.error);
    else { setSuccess('Decider lineup submitted.'); router.refresh(); }
    setSaving(false);
  }

  return (
    <div className="border-t border-surface-border px-4 py-3 space-y-3 bg-surface/60">
      <p className="text-xs font-semibold text-slate-300">Lineup for {myTeam.name}</p>

      {ctx.rubberLineup.map((rubber) => {
        const match = ctx.matches.find((m) => m.rubber_sequence === rubber.sequence && !m.is_decider);
        const locked = match?.status !== 'scheduled';
        const needsPartner = rubber.play_format === 'doubles' || rubber.play_format === 'mixed_doubles';
        const oppEntry = ctx.mySide === 'a' ? match?.entry_b : match?.entry_a;

        return (
          <div key={rubber.sequence} className="flex flex-wrap items-center gap-2 text-xs">
            <span className="w-28 shrink-0 text-slate-400">{rubber.name}</span>
            {locked ? (
              <span className="text-slate-500">
                {nameOf(myTeam.roster, picks[rubber.sequence]?.player_id)}
                {picks[rubber.sequence]?.partner_id && ` / ${nameOf(myTeam.roster, picks[rubber.sequence]?.partner_id)}`}
                {' '}(locked — match started)
              </span>
            ) : (
              <>
                <select
                  value={picks[rubber.sequence]?.player_id ?? ''}
                  onChange={(e) => setPicks((p) => ({ ...p, [rubber.sequence]: { ...p[rubber.sequence], player_id: e.target.value } }))}
                  className={selectClass}
                >
                  <option value="">Choose player…</option>
                  {myTeam.roster.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                </select>
                {needsPartner && (
                  <select
                    value={picks[rubber.sequence]?.partner_id ?? ''}
                    onChange={(e) => setPicks((p) => ({ ...p, [rubber.sequence]: { ...p[rubber.sequence], partner_id: e.target.value } }))}
                    className={selectClass}
                  >
                    <option value="">Choose partner…</option>
                    {myTeam.roster.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                  </select>
                )}
              </>
            )}
            <span className="ml-auto text-slate-600">
              vs {nameOf(oppRoster, oppEntry?.player_id)}{oppEntry?.partner_id ? ` / ${nameOf(oppRoster, oppEntry.partner_id)}` : ''}
            </span>
          </div>
        );
      })}

      <button
        onClick={handleSubmit}
        disabled={saving}
        className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Submit lineup'}
      </button>

      {ctx.tieStatus === 'awaiting_decider' && ctx.deciderFormat && (
        <div className="mt-3 border-t border-surface-border pt-3 space-y-2">
          <p className="text-xs font-semibold text-amber-300">Decider needed — pick your player{ctx.deciderFormat === 'doubles' ? 's' : ''}</p>
          <div className="flex items-center gap-2">
            <select
              value={deciderPick.player_id}
              onChange={(e) => setDeciderPick((p) => ({ ...p, player_id: e.target.value }))}
              className={selectClass}
            >
              <option value="">Choose player…</option>
              {myTeam.roster.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
            {ctx.deciderFormat === 'doubles' && (
              <select
                value={deciderPick.partner_id}
                onChange={(e) => setDeciderPick((p) => ({ ...p, partner_id: e.target.value }))}
                className={selectClass}
              >
                <option value="">Choose partner…</option>
                {myTeam.roster.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </select>
            )}
            <button
              onClick={handleDeciderSubmit}
              disabled={saving || !deciderPick.player_id}
              className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 transition-colors disabled:opacity-50"
            >
              Submit decider
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}
      {success && <p className="text-xs text-accent-400">{success}</p>}
    </div>
  );
}
