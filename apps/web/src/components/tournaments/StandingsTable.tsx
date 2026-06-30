'use client';

/**
 * Live standings table for round-robin and Swiss categories.
 *
 * Standings are computed client-side from the matches prop (which is kept fresh
 * by the Realtime subscription in DrawSection).  No separate data-fetch needed.
 */

import { memo, useMemo } from 'react';
import type { MatchWithPlayers, TieWithTeams } from '@/lib/actions/draws';

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
                <StandingsRows standings={sorted} advancePerGroup={advancePerGroup} allMatchesDone={gTotal > 0 && gCompleted === gTotal} />
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

/** Renders a single player name or stacked doubles pair — both players in the
 *  same font weight/color since neither is more "primary" than the other. */
function PlayerNameCell({ name }: { name: string }) {
  const parts = name.split(' / ');
  if (parts.length === 2) {
    return (
      <div className="flex flex-col leading-snug">
        <span className="text-slate-200">{parts[0]}</span>
        <span className="text-slate-200">{parts[1]}</span>
      </div>
    );
  }
  return <span>{name}</span>;
}

function StandingsRows({
  standings,
  advancePerGroup,
  allMatchesDone = false,
}: {
  standings: Standing[];
  advancePerGroup?: number;
  /** Only highlight qualifying rows once every match in this group has been
   *  played — showing it before any results exist is misleading. */
  allMatchesDone?: boolean;
}) {
  const cutAt = (allMatchesDone && advancePerGroup != null && advancePerGroup > 0) ? advancePerGroup : null;

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

// ── Team standings (team_event) — ties are the unit, not individual matches ──

interface TeamStanding {
  teamId: string;
  teamName: string;
  played: number;
  wins: number;
  losses: number;
  rubbersWon: number;
  rubbersLost: number;
  pointDiff: number;
}

function buildTeamStandings(ties: TieWithTeams[]): Map<string, TeamStanding> {
  const map = new Map<string, TeamStanding>();

  function getOrCreate(id: string, name: string): TeamStanding {
    if (!map.has(id)) {
      map.set(id, { teamId: id, teamName: name, played: 0, wins: 0, losses: 0, rubbersWon: 0, rubbersLost: 0, pointDiff: 0 });
    }
    return map.get(id)!;
  }

  for (const tie of ties) {
    if (!tie.team_a || !tie.team_b) continue;

    // Always list both teams (even before any ties are played) — matches the
    // singles/doubles GroupSection behavior of showing every entrant with a
    // 0-0 record until results come in, instead of hiding them entirely.
    const a = getOrCreate(tie.team_a.id, tie.team_a.name);
    const b = getOrCreate(tie.team_b.id, tie.team_b.name);

    // Rubbers won/lost and point differential are live on the tie row — the
    // DB trigger recomputes them after every individual rubber completes,
    // independent of whether the tie itself has been decided yet. Show that
    // progress immediately instead of waiting for the whole tie to finish.
    a.rubbersWon += tie.rubbers_won_a;
    a.rubbersLost += tie.rubbers_won_b;
    b.rubbersWon += tie.rubbers_won_b;
    b.rubbersLost += tie.rubbers_won_a;
    a.pointDiff += tie.point_diff_a;
    b.pointDiff -= tie.point_diff_a;

    // Played/Win/Loss only make sense once the tie itself is fully decided.
    if (tie.status !== 'completed') continue;

    a.played++;
    b.played++;

    if (tie.winner_team_id === tie.team_a.id) { a.wins++; b.losses++; }
    else if (tie.winner_team_id === tie.team_b.id) { b.wins++; a.losses++; }
  }

  return map;
}

function sortTeamStandings(standings: TeamStanding[], ties: TieWithTeams[]): TeamStanding[] {
  return standings.sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (a.losses !== b.losses) return a.losses - b.losses;
    if (b.pointDiff !== a.pointDiff) return b.pointDiff - a.pointDiff;
    if (b.rubbersWon !== a.rubbersWon) return b.rubbersWon - a.rubbersWon;
    if (a.rubbersLost !== b.rubbersLost) return a.rubbersLost - b.rubbersLost;
    const h2h = ties.find((t) =>
      (t.team_a?.id === a.teamId && t.team_b?.id === b.teamId) ||
      (t.team_a?.id === b.teamId && t.team_b?.id === a.teamId),
    );
    if (h2h?.winner_team_id === b.teamId) return 1;
    if (h2h?.winner_team_id === a.teamId) return -1;
    return 0;
  });
}

export const TeamStandingsTable = memo(function TeamStandingsTable({ ties, advancePerGroup }: { ties: TieWithTeams[]; advancePerGroup?: number }) {
  const relevantTies = useMemo(() => ties.filter((t) => t.group_name !== null), [ties]);
  const { completed, total, standingsMap } = useMemo(() => ({
    completed: relevantTies.filter((t) => t.status === 'completed').length,
    total: relevantTies.filter((t) => t.team_a && t.team_b).length,
    standingsMap: buildTeamStandings(relevantTies),
  }), [relevantTies]);

  if (total === 0) return null;

  const groupNames = [...new Set(relevantTies.map((t) => t.group_name).filter(Boolean))].sort();
  const isGrouped = groupNames.length > 0;

  if (isGrouped) {
    return (
      <section className="mt-8">
        <div className="mb-3 flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Group Standings</h3>
          <span className="text-xs text-slate-600">{completed}/{total} ties done</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {groupNames.map((groupName) => {
            const gTies = relevantTies.filter((t) => t.group_name === groupName);
            const gCompleted = gTies.filter((t) => t.status === 'completed').length;
            const gTotal = gTies.filter((t) => t.team_a && t.team_b).length;
            const sorted = sortTeamStandings([...buildTeamStandings(gTies).values()], gTies);
            return (
              <div key={groupName} className="rounded-xl bg-surface-card ring-1 ring-surface-border overflow-hidden">
                <div className="border-b border-surface-border px-4 py-2.5 flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-300">{groupName}</p>
                  <span className="text-[11px] text-slate-600">{gCompleted}/{gTotal} played</span>
                </div>
                <TeamStandingsRows standings={sorted} advancePerGroup={advancePerGroup} allTiesDone={gTotal > 0 && gCompleted === gTotal} />
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  const sorted = sortTeamStandings([...standingsMap.values()], relevantTies);

  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Standings</h3>
        <span className="text-xs text-slate-600">{completed}/{total} ties done</span>
      </div>
      <div className="rounded-xl bg-surface-card ring-1 ring-surface-border overflow-hidden">
        <TeamStandingsRows standings={sorted} />
      </div>
    </section>
  );
});

function TeamStandingsRows({
  standings,
  advancePerGroup,
  allTiesDone = false,
}: {
  standings: TeamStanding[];
  advancePerGroup?: number;
  /** Only highlight qualifying rows once every tie in this group has been
   *  played — showing it before any results exist is misleading. */
  allTiesDone?: boolean;
}) {
  const cutAt = (allTiesDone && advancePerGroup != null && advancePerGroup > 0) ? advancePerGroup : null;

  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b border-surface-border text-slate-500">
          <th className="px-4 py-2 text-left font-medium w-6">#</th>
          <th className="px-2 py-2 text-left font-medium">Team</th>
          <th className="px-2 py-2 text-center font-medium w-10" title="Ties played">TP</th>
          <th className="px-2 py-2 text-center font-medium w-10" title="Ties won">W</th>
          <th className="px-2 py-2 text-center font-medium w-10" title="Ties lost">L</th>
          <th className="px-2 py-2 text-center font-medium w-14" title="Rubbers won-lost">Rubbers</th>
          <th className="px-2 py-2 text-center font-medium w-14" title="Point differential">PD</th>
        </tr>
      </thead>
      <tbody>
        {standings.map((s, idx) => {
          const qualifies = cutAt !== null && idx < cutAt;
          // Draw a dashed cut-line after the last qualifying row
          const isCutRow = cutAt !== null && idx === cutAt - 1 && cutAt < standings.length;
          const diffStr = s.pointDiff > 0 ? `+${s.pointDiff}` : `${s.pointDiff}`;
          return (
            <tr
              key={s.teamId}
              className={[
                qualifies ? 'bg-accent-500/10' : '',
                isCutRow
                  ? 'border-b-2 border-dashed border-accent-500/40'
                  : 'border-b border-surface-border',
              ].join(' ')}
            >
              <td className={`px-4 py-2.5 font-semibold ${qualifies ? 'text-accent-400' : 'text-slate-500'}`}>
                {idx + 1}
              </td>
              <td className="px-2 py-2 font-medium text-slate-200">{s.teamName}</td>
              <td className="px-2 py-2.5 text-center text-slate-400">{s.played}</td>
              <td className="px-2 py-2.5 text-center font-semibold text-white">{s.wins}</td>
              <td className="px-2 py-2.5 text-center text-slate-500">{s.losses}</td>
              <td className="px-2 py-2.5 text-center text-slate-300">{s.rubbersWon}–{s.rubbersLost}</td>
              <td className={`px-2 py-2.5 text-center font-medium ${
                s.pointDiff > 0 ? 'text-accent-400' : s.pointDiff < 0 ? 'text-red-400' : 'text-slate-500'
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
