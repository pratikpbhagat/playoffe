import type { DrawConfig, GeneratedDraw, DrawMatch, DrawRound } from '@pickleball/shared';
import { makeId, nextPowerOfTwo, roundName } from '../utils';

export function singleElimination(config: DrawConfig): GeneratedDraw {
  const { entries, category_id } = config;
  const bracketSize = nextPowerOfTwo(entries.length);
  const byes = bracketSize - entries.length;

  const slots = [...entries, ...Array(byes).fill(null)];
  const matchIds: string[][] = [];
  const rounds: DrawRound[] = [];
  let totalRounds = Math.log2(bracketSize);
  let matchesInRound = bracketSize / 2;
  let roundIndex = 1;

  const firstRoundMatchIds: string[] = [];
  const firstRoundMatches: DrawMatch[] = [];

  for (let i = 0; i < matchesInRound; i++) {
    const id = makeId();
    firstRoundMatchIds.push(id);
    const a = slots[i * 2] ?? null;
    const b = slots[i * 2 + 1] ?? null;
    firstRoundMatches.push({
      id,
      round: roundIndex,
      round_name: roundName(totalRounds, roundIndex),
      group_name: null,
      entry_a: a,
      entry_b: b,
      winner_advances_to: null,
      loser_advances_to: null,
    });
  }
  matchIds.push(firstRoundMatchIds);
  rounds.push({ round: roundIndex, round_name: roundName(totalRounds, roundIndex), matches: firstRoundMatches });

  matchesInRound /= 2;
  roundIndex++;

  while (matchesInRound >= 1) {
    const prevIds = matchIds[matchIds.length - 1];
    const currentIds: string[] = [];
    const matches: DrawMatch[] = [];

    for (let i = 0; i < matchesInRound; i++) {
      const id = makeId();
      currentIds.push(id);
      matches.push({
        id,
        round: roundIndex,
        round_name: roundName(totalRounds, roundIndex),
        group_name: null,
        entry_a: null,
        entry_b: null,
        winner_advances_to: null,
        loser_advances_to: null,
      });
      if (prevIds[i * 2] !== undefined) {
        const prevMatch = rounds[rounds.length - 1].matches.find((m) => m.id === prevIds[i * 2]);
        if (prevMatch) prevMatch.winner_advances_to = id;
      }
      if (prevIds[i * 2 + 1] !== undefined) {
        const prevMatch = rounds[rounds.length - 1].matches.find((m) => m.id === prevIds[i * 2 + 1]);
        if (prevMatch) prevMatch.winner_advances_to = id;
      }
    }

    matchIds.push(currentIds);
    rounds.push({ round: roundIndex, round_name: roundName(totalRounds, roundIndex), matches });
    matchesInRound /= 2;
    roundIndex++;
    if (matchesInRound < 1) break;
  }

  return { format: 'single_elimination', category_id, rounds, generated_at: new Date().toISOString() };
}
