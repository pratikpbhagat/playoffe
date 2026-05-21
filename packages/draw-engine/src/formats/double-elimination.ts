import type { DrawConfig, GeneratedDraw } from '@pickleball/shared';
import { singleElimination } from './single-elimination';

export function doubleElimination(config: DrawConfig): GeneratedDraw {
  const { category_id } = config;
  const winnersBracket = singleElimination(config);
  const maxRound = Math.max(...winnersBracket.rounds.map((r) => r.round));

  const losersBracketRounds = winnersBracket.rounds.slice(0, -1).map((r) => ({
    ...r,
    round: r.round + maxRound,
    round_name: `Losers - ${r.round_name}`,
    matches: r.matches.map((m) => ({
      ...m,
      id: `losers-${m.id}`,
      round: m.round + maxRound,
      round_name: `Losers - ${m.round_name}`,
    })),
  }));

  const grandFinalRound = maxRound + losersBracketRounds.length + 1;

  return {
    format: 'double_elimination',
    category_id,
    rounds: [
      ...winnersBracket.rounds.map((r) => ({ ...r, round_name: `Winners - ${r.round_name}` })),
      ...losersBracketRounds,
      {
        round: grandFinalRound,
        round_name: 'Grand Final',
        matches: [
          {
            id: `grand-final-${category_id}`,
            round: grandFinalRound,
            round_name: 'Grand Final',
            group_name: null,
            entry_a: null,
            entry_b: null,
            winner_advances_to: null,
            loser_advances_to: null,
          },
        ],
      },
    ],
    generated_at: new Date().toISOString(),
  };
}
