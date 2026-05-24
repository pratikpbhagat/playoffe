'use client';

/**
 * Live standings table for round-robin and Swiss categories.
 *
 * Standings are computed client-side from the matches prop (which is kept fresh
 * by the Realtime subscription in DrawSection).  No separate data-fetch needed.
 */

import type { MatchWithPlayers } from '@/lib/actions/draws';

interface Props {
  matches: MatchWithPlayers[];
  format: string; // 'round_robin' | 'swiss' | 'group_stage_knockout'
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

function buildStandings(matches: MatchWithPlayers[]): Map<string, Standing> {
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

function sortStandings(standings: Standing[]): Standing[] {
  return standings.sort((a, b) => {
    // 1. Most wins
    if (b.wins !== a.wins) return b.wins - a.wins;
    // 2. Best set differential
    const aDiff = a.setsWon - a.setsLost;
    const bDiff = b.setsWon - b.setsLost;
    if (bDiff !== aDiff) return bDiff - aDiff;
    // 3. Best point differential
    return (b.pointsWon - b.pointsLost) - (a.pointsWon - a.pointsLost);
  });
}

export function StandingsTable({ matches, format }: Props) {
  // Only show for formats where standings are meaningful
  if (format !== 'round_robin' && format !== 'swiss' && format !== 'group_stage_knockout') {
    return null;
  }

  // For group_stage_knockout, only count group-stage matches (no round_name "Knockout")
  const relevantMatches = format === 'group_stage_knockout'
    ? matches.filter((m) => m.round_name?.includes('Group'))
    : matches;

  const completed = relevantMatches.filter(
    (m) => m.status === 'completed' || m.status === 'walkover',
  ).length;
  const total = relevantMatches.filter(
    (m) => m.entry_a !== null && m.entry_b !== null,
  ).length;

  if (total === 0) return null;

  const standingsMap = buildStandings(relevantMatches);

  // For group_stage_knockout, group standings by group_name
  if (format === 'group_stage_knockout') {
    const groupNames = [...new Set(relevantMatches.map((m) => m.group_name).filter(Boolean))];

    return (
      <section className="mt-8">
        <div className="mb-3 flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Group standings</h3>
          <span className="text-xs text-slate-600">{completed}/{total} matches done</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {groupNames.map((groupName) => {
            const groupMatches = relevantMatches.filter((m) => m.group_name === groupName);
            const groupStandings = buildStandings(groupMatches);
            const sorted = sortStandings([...groupStandings.values()]);
            return (
              <div key={groupName} className="rounded-xl bg-surface-card ring-1 ring-surface-border overflow-hidden">
                <div className="border-b border-surface-border px-4 py-2">
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-400">{groupName}</p>
                </div>
                <StandingsRows standings={sorted} />
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  const sorted = sortStandings([...standingsMap.values()]);

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
}

function StandingsRows({ standings }: { standings: Standing[] }) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b border-surface-border text-slate-500">
          <th className="px-4 py-2 text-left font-medium w-6">#</th>
          <th className="px-2 py-2 text-left font-medium">Player</th>
          <th className="px-2 py-2 text-center font-medium w-10">P</th>
          <th className="px-2 py-2 text-center font-medium w-10">W</th>
          <th className="px-2 py-2 text-center font-medium w-10">L</th>
          <th className="px-2 py-2 text-center font-medium w-14">Sets</th>
          <th className="px-2 py-2 text-center font-medium w-14 hidden sm:table-cell">Pts</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-surface-border">
        {standings.map((s, idx) => (
          <tr
            key={s.entryId}
            className={idx === 0 && standings.length > 1 ? 'bg-brand-600/5' : ''}
          >
            <td className="px-4 py-2.5 text-slate-500">{idx + 1}</td>
            <td className="px-2 py-2.5 font-medium text-slate-200 truncate max-w-[140px]">
              {s.playerName}
              {idx === 0 && standings.length > 1 && (
                <span className="ml-1.5 text-[10px] text-brand-400">●</span>
              )}
            </td>
            <td className="px-2 py-2.5 text-center text-slate-400">{s.played}</td>
            <td className="px-2 py-2.5 text-center font-semibold text-white">{s.wins}</td>
            <td className="px-2 py-2.5 text-center text-slate-500">{s.losses}</td>
            <td className="px-2 py-2.5 text-center text-slate-400">
              {s.setsWon}–{s.setsLost}
            </td>
            <td className="px-2 py-2.5 text-center text-slate-500 hidden sm:table-cell">
              {s.pointsWon}–{s.pointsLost}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
