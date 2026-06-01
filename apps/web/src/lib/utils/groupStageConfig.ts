/**
 * Auto-calculation helpers for group stage + knockout draw configuration.
 * All functions are pure and work on primitive numbers — safe to import in
 * both client and server components.
 */

/**
 * Suggest a sensible group configuration for a given max_entries count.
 *
 * Priority order for group size: 4 (most common in pickleball), 3, 5, 6, 8.
 * Falls back to rounding to the nearest group of 4 for awkward entry counts.
 *
 * Returns:
 *  - groupsCount : number of groups
 *  - groupSize   : players per group (may be uneven if max_entries is not evenly divisible)
 */
export function suggestGroupConfig(maxEntries: number): { groupsCount: number; groupSize: number } {
  if (maxEntries < 2) return { groupsCount: 1, groupSize: maxEntries };

  const preferredSizes = [4, 3, 5, 6, 8];
  for (const size of preferredSizes) {
    if (maxEntries % size === 0) {
      return { groupsCount: maxEntries / size, groupSize: size };
    }
  }

  // Fallback — target groups of ~4
  const groupsCount = Math.max(2, Math.round(maxEntries / 4));
  const groupSize = Math.ceil(maxEntries / groupsCount);
  return { groupsCount, groupSize };
}

/**
 * Given a group count and max_entries, return the actual player-per-group figure
 * (ceiling division so that all entries fit).
 */
export function deriveGroupSize(maxEntries: number, groupsCount: number): number {
  if (groupsCount <= 0) return 0;
  return Math.ceil(maxEntries / groupsCount);
}

/**
 * Return the total number of teams in the knockout bracket.
 * Knockout teams = groups × advance_per_group.
 */
export function deriveKnockoutTeams(groupsCount: number, advancePerGroup: number): number {
  return groupsCount * advancePerGroup;
}

/**
 * Return the bracket size (next power of 2 ≥ knockoutTeams) and how many
 * first-round byes that implies.
 */
export function deriveBracketSize(knockoutTeams: number): { bracketSize: number; byes: number } {
  let bracketSize = 2;
  while (bracketSize < knockoutTeams) bracketSize *= 2;
  return { bracketSize, byes: bracketSize - knockoutTeams };
}

/** Named round labels keyed by number of bracket slots. */
const ROUND_NAMES: Record<number, string> = {
  64: 'Round of 64',
  32: 'Round of 32',
  16: 'Round of 16',
  8: 'Quarter-finals',
  4: 'Semi-finals',
  2: 'Final',
};

/**
 * Return the ordered list of knockout round names for a given number of
 * qualifying teams, e.g.:
 *   8  → ['Quarter-finals', 'Semi-finals', 'Final']
 *   12 → ['Round of 16 (4 byes)', 'Quarter-finals', 'Semi-finals', 'Final']
 *   16 → ['Round of 16', 'Quarter-finals', 'Semi-finals', 'Final']
 */
export function getKnockoutRoundNames(knockoutTeams: number): string[] {
  if (knockoutTeams < 2) return [];

  const { bracketSize, byes } = deriveBracketSize(knockoutTeams);
  const rounds: string[] = [];
  let size = bracketSize;

  while (size >= 2) {
    const name = ROUND_NAMES[size] ?? `Round of ${size}`;
    if (size === bracketSize && byes > 0) {
      rounds.push(`${name} (${byes} ${byes === 1 ? 'bye' : 'byes'})`);
    } else {
      rounds.push(name);
    }
    size /= 2;
  }

  return rounds;
}
