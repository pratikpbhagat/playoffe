import type { DrawConfig, GeneratedDraw, DrawGroup } from '@pickleball/shared';
import { roundRobin } from './round-robin';
import { singleElimination } from './single-elimination';
import { makeId } from '../utils';

export function groupStageKnockout(config: DrawConfig): GeneratedDraw {
  const { entries, category_id, group_size = 4, group_sizes, top_per_group_advance = 2 } = config;

  const groups = group_sizes && group_sizes.length > 0
    ? splitIntoGroupsBySizes(entries, group_sizes)
    : splitIntoGroups(entries, group_size);
  const drawGroups: DrawGroup[] = groups.map((groupEntries, idx) => {
    const groupName = String.fromCharCode(65 + idx);
    const groupDraw = roundRobin({ ...config, entries: groupEntries, category_id });
    const matches = groupDraw.rounds.flatMap((r) => r.matches).map((m) => ({
      ...m,
      group_name: `Group ${groupName}`,
    }));
    return { name: `Group ${groupName}`, entries: groupEntries, matches };
  });

  if (config.knockout_seeding === 'manual') {
    const groupRoundsOnly = drawGroups.flatMap((g) => {
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
    return {
      format: 'group_stage_knockout',
      category_id,
      rounds: groupRoundsOnly,
      groups: drawGroups,
      generated_at: new Date().toISOString(),
    };
  }

  const knockoutEntryCount = groups.length * top_per_group_advance;
  // Use placeholder entries just to determine bracket structure — entry IDs are
  // nulled out afterwards so they don't violate tournament_entries FK constraints.
  // Real entries are filled in after the group stage completes.
  const knockoutEntries = Array.from({ length: knockoutEntryCount }, (_, i) => ({
    entry_id: makeId(),
    player_ids: [],
    display_name: `Group Qualifier ${i + 1}`,
    seed: i + 1,
    rating: 1500,
  }));

  const knockoutDraw = singleElimination({
    ...config,
    entries: knockoutEntries,
    category_id,
    // Explicitly forward has_third_place_match so the user's choice is respected.
    // If not set, default to false for group-stage draws (different from standalone SE).
    has_third_place_match: config.has_third_place_match ?? false,
  });

  // Null out all entry slots in knockout matches — slots are TBD until group
  // stage results are recorded and standings are computed.
  knockoutDraw.rounds.forEach((r) => {
    r.matches.forEach((m) => {
      m.entry_a = null;
      m.entry_b = null;
    });
  });

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

/** Split entries into groups of explicitly specified sizes (ordered). */
function splitIntoGroupsBySizes<T>(arr: T[], sizes: number[]): T[][] {
  const groups: T[][] = [];
  let offset = 0;
  for (const size of sizes) {
    groups.push(arr.slice(offset, offset + size));
    offset += size;
  }
  return groups;
}
