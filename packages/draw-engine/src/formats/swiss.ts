import type { DrawConfig, GeneratedDraw, DrawMatch } from '@pickleball/shared';
import { makeId } from '../utils';

export function swiss(config: DrawConfig): GeneratedDraw {
  const { entries, category_id } = config;
  const n = entries.length;
  const totalRounds = Math.ceil(Math.log2(n));
  const rounds = [];

  const standings = entries.map((e) => ({ ...e, points: 0, opponents: new Set<string>() }));

  for (let round = 1; round <= totalRounds; round++) {
    const paired = new Set<string>();
    const matches: DrawMatch[] = [];

    const sorted = [...standings].sort((a, b) => b.points - a.points);

    for (let i = 0; i < sorted.length; i++) {
      if (paired.has(sorted[i].entry_id)) continue;
      for (let j = i + 1; j < sorted.length; j++) {
        if (paired.has(sorted[j].entry_id)) continue;
        if (sorted[i].opponents.has(sorted[j].entry_id)) continue;

        const match: DrawMatch = {
          id: makeId(),
          round,
          round_name: `Round ${round}`,
          group_name: null,
          entry_a: entries.find((e) => e.entry_id === sorted[i].entry_id) ?? null,
          entry_b: entries.find((e) => e.entry_id === sorted[j].entry_id) ?? null,
          winner_advances_to: null,
          loser_advances_to: null,
        };

        matches.push(match);
        paired.add(sorted[i].entry_id);
        paired.add(sorted[j].entry_id);
        sorted[i].opponents.add(sorted[j].entry_id);
        sorted[j].opponents.add(sorted[i].entry_id);
        break;
      }
    }

    rounds.push({ round, round_name: `Round ${round}`, matches });
  }

  return { format: 'swiss', category_id, rounds, generated_at: new Date().toISOString() };
}
