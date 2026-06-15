'use client';

/**
 * Live standings table for round-robin and Swiss categories.
 *
 * Standings are computed client-side from the matches prop (which is kept fresh
 * by the Realtime subscription in DrawSection).  No separate data-fetch needed.
 */

import { memo, useMemo } from 'react';
import type { MatchWithPlayers } from '@/lib/actions/draws';

interface Props {
  matches: MatchWithPlayers[];
  format: string; // 'round_robin' | 'swiss' | 'group_stage_knockout'
  /** How many teams advance from each group — used to highlight qualifying rows. Only meaningful for group_stage_knockout. */
  advancePerGroup?: number;
}

interface Standing {
  entryId: string;
  playerName: string;
  played: number;
  wins: number;
  losses: number;
  setsWon: number;
  setsLost: number;
  pointsWon: number;
  pointsLost: number;
}

function buildStandings(matches: MatchWithPlayers[], includeAll = false): Map<string, Standing> {
  const map = new Map<string, Standing>();

  function getOrCreate(entry: NonNullable<MatchWithPlayers['entry_a']>): Standing {
    if (!map.has(entry.id)) {
      const displayName = entry.partner_name
        ? `${entry.player_name} / ${entry.partner_name}`
        : entry.player_name;
      map.set(entry.id, {
        entryId: entry.id,
        playerName: displayName,
        played: 0,
        wins: 0,
        losses: 0,
        setsWon: 0,
        setsLost: 0,
        pointsWon: 0,
        pointsLost: 0,
      });
    }
    return map.get(entry.id)!;
  }

  // When includeAll=true, seed the map with every entry in the match list so
  // players appear even before their first match is completed.
  if (includeAll) {
    for (const m of matches) {
      if (m.entry_a) getOrCreate(m.entry_a);
      if (m.entry_b) getOrCreate(m.entry_b);
    }
  }

  for (const m of matches) {
    if (m.status !== 'completed' && m.status !== 'walkover') continue;
    if (!m.entry_a || !m.entry_b) continue;

    const a = getOrCreate(m.entry_a);
    const b = getOrCreate(m.entry_b);

    a.played++;
    b.played++;

    if (m.winner_entry_id === m.entry_a.id) {
      a.wins++;
      b.losses++;
    } else if (m.winner_entry_id === m.entry_b.id) {
      b.wins++;
      a.losses++;
    }

    // Tally set and point scores from the sets JSONB column
    if (Array.isArray(m.sets)) {
      for (const set of m.sets as { score_a: number; score_b: number }[]) {
        a.setsWon += set.score_a > set.score_b ? 1 : 0;
        a.setsLost += set.score_b > set.score_a ? 1 : 0;
        b.setsWon += set.score_b > set.score_a ? 1 : 0;
        b.setsLost += set.score_a > set.score_b ? 1 : 0;
        a.pointsWon += set.score_a;
        a.pointsLost += set.score_b;
        b.pointsWon += set.score_b;
        b.pointsLost += set.score_a;
      }
    }
  }

  return map;
}

function sortStandings(standings: Standing[], matches?: MatchWithPlayers[]): Standing[] {
  return standings.sort((a, b) => {
    // 1. Most wins
    if (b.wins !== a.wins) return b.wins - a.wins;
    // 2. Fewest losses
    if (a.losses !== b.losses) return a.losses - b.losses;
    // 3. Best point differential
    const aDiff = a.pointsWon - a.pointsLost;
    const bDiff = b.pointsWon - b.pointsLost;
    if (bDiff !== aDiff) return bDiff - aDiff;
    // 4. Most points scored
    if (b.pointsWon !== a.pointsWon) return b.pointsWon - a.pointsWon;
    // 5. Fewest points given
    if (a.pointsLost !== b.pointsLost) return a.pointsLost - b.pointsLost;
    // 6. Head-to-head result between the two tied teams
    if (matches) {
      const h2h = matches.find((m) =>
        (m.entry_a?.id === a.entryId && m.entry_b?.id === b.entryId) ||
        (m.entry_a?.id === b.entryId && m.entry_b?.id === a.entryId),
      );
      if (h2h?.winner_entry_id === b.entryId) return 1;
      if (h2h?.winner_entry_id === a.entryId) return -1;
    }
    return 0;
  });
}

export const StandingsTable = memo(function StandingsTable({ matches, format, advancePerGroup }: Props) {
  // For group_stage_knockout, only count group-stage matches.
  // Group stage matches have group_name set; knockout matches have group_name=null.
  const relevantMatches = useMemo(
    () => (format === 'group_stage_knockout' ? matches.filter((m) => m.group_name !== null) : matches),
    [matches, format],
  );

  const { completed, total, standingsMap } = useMemo(() => ({
    completed: relevantMatches.filter((m) => m.status === 'completed' || m.status === 'walkover').length,
    total: relevantMatches.filter((m) => m.entry_a !== null && m.entry_b !== null).length,
    standingsMap: buildStandings(relevantMatches),
  }), [relevantMatches]);

  // Only show for formats where standings are meaningful
  if (format !== 'round_robin' && format !== 'swiss' && format !== 'group_stage_knockout') {
    return null;
  }

  if (total === 0) return null;

  // For group_stage_knockout, group standings by group_name
  if (format === 'group_stage_knockout') {
    const groupNames = [...new Set(relevantMatches.map((m) => m.group_name).filter(Boolean))].sort();

    return (
      <section className="mt-8">
        <div className="mb-3 flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Group Standings</h3>
          <span className="text-xs text-slate-600">{completed}/{total} matches done</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {groupNames.map((groupName) => {
            const gMatches = relevantMatches.filter((m) => m.group_name === groupName);
            const gCompleted = gMatches.filter((m) => m.status === 'completed' || m.status === 'walkover').length;
            const gTotal = gMatches.filter((m) => m.entry_a !== null && m.entry_b !== null).length;
            // includeAll=true so every player in the group appears even before play starts
            const groupStandings = buildStandings(gMatches, true);
            const sorted = sortStandings([...groupStandings.values()], gMatches);
            return (
              <div key={groupName} className="rounded-xl bg-surface-card ring-1 ring-surface-border overflow-hidden">
                <div className="border-b border-surface-border px-4 py-2.5 flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-300">{groupName}</p>
                  <span className="text-[11px] text-slate-600">{gCompleted}/{gTotal} played</span>
                </div>
                <StandingsRows standings={sorted} advancePerGroup={advancePerGroup} />
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  const sorted = sortStandings([...standingsMap.values()], relevantMatches);

  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Standings</h3>
        <span className="text-xs text-slate-600">{completed}/{total} matches done</span>
      </div>
      <div className="rounded-xl bg-surface-card ring-1 ring-surface-border overflow-hidden">
        <StandingsRows standings={sorted} />
      </div>
    </section>
  );
});

/** Renders a single player name or stacked doubles pair. */
function PlayerNameCell({ name }: { name: string }) {
  const parts = name.split(' / ');
  if (parts.length === 2) {
    return (
      <div className="flex flex-col leading-snug">
        <span className="text-slate-200">{parts[0]}</span>
        <span className="text-slate-400">{parts[1]}</span>
      </div>
    );
  }
  return <span>{name}</span>;
}

function StandingsRows({ standings, advancePerGroup }: { standings: Standing[]; advancePerGroup?: number }) {
  const cutAt = (advancePerGroup != null && advancePerGroup > 0) ? advancePerGroup : null;

  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b border-surface-border text-slate-500">
          <th className="px-4 py-2 text-left font-medium w-6">#</th>
          <th className="px-2 py-2 text-left font-medium">Player</th>
          <th className="px-2 py-2 text-center font-medium w-10" title="Matches played">MP</th>
          <th className="px-2 py-2 text-center font-medium w-10" title="Matches won">W</th>
          <th className="px-2 py-2 text-center font-medium w-10" title="Matches lost">L</th>
          <th className="px-2 py-2 text-center font-medium w-12" title="Points scored">PS</th>
          <th className="px-2 py-2 text-center font-medium w-12" title="Points against">PL</th>
          <th className="px-2 py-2 text-center font-medium w-14" title="Points difference">PD</th>
        </tr>
      </thead>
      <tbody>
        {standings.map((s, idx) => {
          const qualifies = cutAt !== null && idx < cutAt;
          // Draw a dashed cut-line after the last qualifying row
          const isCutRow = cutAt !== null && idx === cutAt - 1 && cutAt < standings.length;
          const diff = s.pointsWon - s.pointsLost;
          const diffStr = diff > 0 ? `+${diff}` : `${diff}`;
          return (
            <tr
              key={s.entryId}
              className={[
                qualifies ? 'bg-accent-500/10' : '',
                isCutRow
                  ? 'border-b-2 border-dashed border-accent-500/40'
                  : 'border-b border-surface-border',
              ].join(' ')}
            >
              {/* Rank — green for qualified, normal otherwise */}
              <td className={`px-4 py-2.5 font-semibold ${qualifies ? 'text-accent-400' : 'text-slate-500'}`}>
                {idx + 1}
              </td>
              <td className="px-2 py-2 font-medium text-slate-200">
                <PlayerNameCell name={s.playerName} />
              </td>
              <td className="px-2 py-2.5 text-center text-slate-400">{s.played}</td>
              <td className="px-2 py-2.5 text-center font-semibold text-white">{s.wins}</td>
              <td className="px-2 py-2.5 text-center text-slate-500">{s.losses}</td>
              <td className="px-2 py-2.5 text-center text-slate-300">{s.pointsWon}</td>
              <td className="px-2 py-2.5 text-center text-slate-500">{s.pointsLost}</td>
              <td className={`px-2 py-2.5 text-center font-medium ${
                diff > 0 ? 'text-accent-400' : diff < 0 ? 'text-red-400' : 'text-slate-500'
              }`}>
                {diffStr}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
