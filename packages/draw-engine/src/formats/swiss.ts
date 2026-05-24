/**
 * Swiss draw generator — Round 1 only.
 *
 * Only the first round is generated at draw time. Subsequent rounds are
 * generated dynamically after results are recorded, using actual standings
 * (see generateNextSwissRoundAction in the web app).
 *
 * Round 1 pairing: sort by seed (then rating), pair adjacent entries
 * (1 vs 2, 3 vs 4, …).  For odd entry counts the last player receives a bye.
 */

import type { DrawConfig, GeneratedDraw, DrawMatch } from '@pickleball/shared';
import { makeId } from '../utils';

export function swiss(config: DrawConfig): GeneratedDraw {
  const { entries, category_id } = config;

  // Sort by seed first, then rating descending
  const seeded = [...entries].sort((a, b) => {
    if (a.seed !== null && b.seed !== null) return a.seed - b.seed;
    if (a.seed !== null) return -1;
    if (b.seed !== null) return 1;
    return b.rating - a.rating;
  });

  const matches: DrawMatch[] = [];

  for (let i = 0; i < seeded.length; i += 2) {
    const entryA = seeded[i] ?? null;
    const entryB = seeded[i + 1] ?? null; // null = bye if odd count

    matches.push({
      id: makeId(),
      round: 1,
      round_name: 'Round 1',
      group_name: null,
      entry_a: entryA,
      entry_b: entryB,
      winner_advances_to: null,
      loser_advances_to: null,
    });
  }

  return {
    format: 'swiss',
    category_id,
    rounds: [{ round: 1, round_name: 'Round 1', matches }],
    generated_at: new Date().toISOString(),
  };
}
