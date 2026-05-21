import {
  INITIAL_RATING,
  MIN_RATING,
  MAX_RATING,
  K_FACTOR,
  SCORE_WEIGHT_MULTIPLIER,
  OPPONENT_STRENGTH_WEIGHT,
} from './constants';

export interface RatingInput {
  playerRating: number;
  opponentRating: number;
  playerScore: number;
  opponentScore: number;
  isWin: boolean;
  playedAt: Date;
  isDoubles: boolean;
}

export interface RatingResult {
  newRating: number;
  change: number;
  performanceScore: number;
}

/**
 * DUPR-style rating calculation for pickleball.
 *
 * Key principles:
 * 1. Score margin matters — winning 11-3 gains more than 11-9
 * 2. Opponent strength matters — beating a stronger player gains more
 * 3. Doubles ratings are weighted at 50% vs singles (separate tracks)
 * 4. Rating clamped to [1.0, 8.0] range (DUPR standard)
 */
export function calculateRatingChange(input: RatingInput): RatingResult {
  const { playerRating, opponentRating, playerScore, opponentScore, isWin } = input;

  const ratingDiff = opponentRating - playerRating;
  const expectedScore = expectedWinProbability(ratingDiff);

  const totalPoints = playerScore + opponentScore;
  const scoreMargin = totalPoints > 0 ? (playerScore - opponentScore) / totalPoints : 0;

  const performanceScore = isWin
    ? 1 + scoreMargin * SCORE_WEIGHT_MULTIPLIER
    : scoreMargin * SCORE_WEIGHT_MULTIPLIER;

  const opponentStrengthFactor = 1 + ratingDiff * OPPONENT_STRENGTH_WEIGHT * 0.1;

  const change = K_FACTOR * (performanceScore - expectedScore) * Math.max(0.5, opponentStrengthFactor);

  const doublesAdjustment = input.isDoubles ? 0.5 : 1.0;

  const newRating = Math.min(
    MAX_RATING,
    Math.max(MIN_RATING, playerRating + change * doublesAdjustment),
  );

  return {
    newRating: Math.round(newRating * 100) / 100,
    change: Math.round((newRating - playerRating) * 100) / 100,
    performanceScore: Math.round(performanceScore * 1000) / 1000,
  };
}

function expectedWinProbability(ratingDiff: number): number {
  return 1 / (1 + Math.pow(10, -ratingDiff / 1.5));
}

export function getInitialRating(estimatedSkill?: 'beginner' | 'c' | 'b' | 'a' | 'open'): number {
  const levels: Record<string, number> = {
    beginner: 2.0,
    c: 2.5,
    b: 3.0,
    a: 3.5,
    open: 4.0,
  };
  return levels[estimatedSkill ?? 'c'] ?? INITIAL_RATING;
}
