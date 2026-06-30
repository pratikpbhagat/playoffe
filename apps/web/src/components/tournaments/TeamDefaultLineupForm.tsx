'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { setTeamDefaultLineupAction } from '@/lib/actions/teams';
import type { Team } from './TeamRosterList';

interface RubberConfig {
  sequence: number;
  name: string;
  play_format: string;
}

interface Props {
  team: Team;
  rubberLineup: RubberConfig[];
}

const selectClass = 'flex-1 min-w-0 rounded border border-slate-600 bg-surface px-2 py-1.5 text-xs text-white outline-none cursor-pointer focus:border-brand-500';

export function TeamDefaultLineupForm({ team, rubberLineup }: Props) {
  const router = useRouter();

  // Captain might also be a playing roster member (a team_members row) —
  // dedupe so they don't show up twice in the player/partner dropdowns.
  const memberPlayers = team.team_members.filter((m) => m.status === 'active' && m.player).map((m) => m.player!);
  const roster = [
    ...(team.captain ? [team.captain] : []),
    ...memberPlayers.filter((p) => p.id !== team.captain?.id),
  ];

  const initialPicks: Record<number, { player_id: string; partner_id: string }> = {};
  for (const rubber of rubberLineup) {
    const slot = (team.default_lineup ?? []).find((s) => s.rubber_sequence === rubber.sequence);
    initialPicks[rubber.sequence] = { player_id: slot?.player_id ?? '', partner_id: slot?.partner_id ?? '' };
  }

  const [picks, setPicks] = useState(initialPicks);
  const [applyToAll, setApplyToAll] = useState(!!team.default_lineup_enabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSuccess(null);

    const lineup = rubberLineup.map((r) => ({
      rubber_sequence: r.sequence,
      player_id: picks[r.sequence]?.player_id ?? '',
      partner_id: picks[r.sequence]?.partner_id || undefined,
    }));

    if (lineup.some((l) => !l.player_id)) {
      setError('Pick a player for every rubber before saving.');
      setSaving(false);
      return;
    }

    const result = await setTeamDefaultLineupAction(team.id, lineup, applyToAll);
    if ('error' in result) setError(result.error);
    else {
      setSuccess(applyToAll ? 'Default lineup saved and applied to all ties.' : 'Default lineup saved.');
      router.refresh();
    }
    setSaving(false);
  }

  if (roster.length === 0) {
    return <p className="px-4 py-3 text-xs text-slate-500">No confirmed roster yet.</p>;
  }

  return (
    <div className="border-t border-surface-border px-4 py-3 space-y-3 bg-surface/60">
      {rubberLineup.map((rubber) => {
        const needsPartner = rubber.play_format === 'doubles' || rubber.play_format === 'mixed_doubles';
        return (
          <div key={rubber.sequence} className="flex flex-wrap items-center gap-2 text-xs">
            <span className="w-32 shrink-0 text-slate-400">{rubber.name}</span>
            <select
              value={picks[rubber.sequence]?.player_id ?? ''}
              onChange={(e) => setPicks((p) => ({ ...p, [rubber.sequence]: { ...p[rubber.sequence], player_id: e.target.value } }))}
              className={selectClass}
            >
              <option value="">Choose player…</option>
              {roster.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
            {needsPartner && (
              <select
                value={picks[rubber.sequence]?.partner_id ?? ''}
                onChange={(e) => setPicks((p) => ({ ...p, [rubber.sequence]: { ...p[rubber.sequence], partner_id: e.target.value } }))}
                className={selectClass}
              >
                <option value="">Choose partner…</option>
                {roster.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </select>
            )}
          </div>
        );
      })}

      <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
        <input
          type="checkbox"
          checked={applyToAll}
          onChange={(e) => setApplyToAll(e.target.checked)}
          className="accent-brand-600"
        />
        Apply this lineup to all of this team&apos;s ties — including future ones (e.g. knockout, after group promotion)
      </label>

      <button
        onClick={handleSave}
        disabled={saving}
        className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save default lineup'}
      </button>

      {error && <p className="text-xs text-red-400">{error}</p>}
      {success && <p className="text-xs text-accent-400">{success}</p>}
    </div>
  );
}
