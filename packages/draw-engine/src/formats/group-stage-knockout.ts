import type { DrawConfig, GeneratedDraw, DrawGroup } from '@pickleball/shared';
import { roundRobin } from './round-robin';
import { singleElimination } from './single-elimination';
import { makeId } from '../utils';

export function groupStageKnockout(config: DrawConfig): GeneratedDraw {
  const { entries, category_id, group_size = 4, top_per_group_advance = 2 } = config;

  const groups = splitIntoGroups(entries, group_size);
  const drawGroups: DrawGroup[] = groups.map((groupEntries, idx) => {
    const groupName = String.fromCharCode(65 + idx);
    const groupDraw = roundRobin({ ...config, entries: groupEntries, category_id });
    const matches = groupDraw.rounds.flatMap((r) => r.matches).map((m) => ({
      ...m,
      group_name: `Group ${groupName}`,
    }));
    return { name: `Group ${groupName}`, entries: groupEntries, matches };
  });

  const knockoutEntryCount = groups.length * top_per_group_advance;
  const knockoutEntries = Array.from({ length: knockoutEntryCount }, (_, i) => ({
    entry_id: makeId(),
    player_ids: [],
    display_name: `Group Qualifier ${i + 1}`,
    seed: i + 1,
    rating: 1500,
  }));

  const knockoutDraw = singleElimination({ ...config, entries: knockoutEntries, category_id });

  const groupRounds = drawGroups.flatMap((g) => {
    const matchesByRound = new Map<number, typeof g.matches>();
    g.matches.forEach((m) => {
      const list = matchesByRound.get(m.round) ?? [];
      list.push(m);
      matchesByRound.set(m.round, list);
    });
    return Array.from(matchesByRound.entries()).map(([round, matches]) => ({
      round,
      round_name: `Group Stage - Round ${round}`,
      matches,
    }));
  });

  const maxGroupRound = Math.max(...groupRounds.map((r) => r.round), 0);
  const knockoutRounds = knockoutDraw.rounds.map((r) => ({
    ...r,
    round: r.round + maxGroupRound,
    round_name: `Knockout - ${r.round_name}`,
  }));

  return {
    format: 'group_stage_knockout',
    category_id,
    rounds: [...groupRounds, ...knockoutRounds],
    groups: drawGroups,
    generated_at: new Date().toISOString(),
  };
}

function splitIntoGroups<T>(arr: T[], groupSize: number): T[][] {
  const groups: T[][] = [];
  for (let i = 0; i < arr.length; i += groupSize) {
    groups.push(arr.slice(i, i + groupSize));
  }
  return groups;
}
