import type { DrawConfig, GeneratedDraw, DrawMatch } from '@pickleball/shared';
import { makeId } from '../utils';

export function roundRobin(config: DrawConfig): GeneratedDraw {
  const { entries, category_id } = config;
  const n = entries.length;

  if (n < 2) throw new Error('Round robin requires at least 2 entries');

  const list = n % 2 === 0 ? [...entries] : [...entries, null];
  const total = list.length;
  const rounds: DrawMatch[][] = [];

  for (let round = 0; round < total - 1; round++) {
    const matches: DrawMatch[] = [];
    for (let i = 0; i < total / 2; i++) {
      const a = list[i];
      const b = list[total - 1 - i];
      if (a && b) {
        matches.push({
          id: makeId(),
          round: round + 1,
          round_name: `Round ${round + 1}`,
          group_name: null,
          entry_a: a,
          entry_b: b,
          winner_advances_to: null,
          loser_advances_to: null,
        });
      }
    }
    rounds.push(matches);
    list.splice(1, 0, list.pop()!);
  }

  return {
    format: 'round_robin',
    category_id,
    rounds: rounds.map((matches, i) => ({
      round: i + 1,
      round_name: `Round ${i + 1}`,
      matches,
    })),
    generated_at: new Date().toISOString(),
  };
}
