/**
 * Auto-calculation helpers for group stage + knockout draw configuration.
 * All functions are pure and work on primitive numbers — safe to import in
 * both client and server components.
 */

/**
 * A single scored suggestion for group configuration.
 */
export interface SuggestedOption {
  groupsCount: number;
  groupSize: number;        // ceil(maxEntries / groupsCount)
  minGroupSize: number;     // floor(maxEntries / groupsCount)
  knockoutTeams: number;    // groupsCount × advancePerGroup
  byes: number;             // 0 when knockoutTeams is a power of 2
  balance: number;          // 0 = all groups same size, 1 = ±1 imbalance
}

/**
 * Suggest the best group configuration for a given entry count and advance-per-group.
 *
 * The algorithm guarantees that knockoutTeams = groupsCount × advancePerGroup is
 * always a power of 2 (no byes, clean bracket). If no such configuration exists
 * for the given advancePerGroup (e.g. advance=3), it falls back to the option
 * with the fewest byes.
 *
 * Optimisation priority (lower = better):
 *   1. balance  — prefer all groups same size (0) over ±1 (1)
 *   2. sizePref — prefer group size closest to 4
 */
export function suggestGroupConfig(
  maxEntries: number,
  advancePerGroup = 2,
): { groupsCount: number; groupSize: number } {
  const options = getSuggestedGroupOptions(maxEntries, advancePerGroup);
  if (options.length === 0) return { groupsCount: 1, groupSize: maxEntries };
  return { groupsCount: options[0].groupsCount, groupSize: options[0].groupSize };
}

/**
 * Return up to 3 ranked valid group configurations (best first).
 * Useful for rendering quick-pick chips in the UI.
 */
export function getSuggestedGroupOptions(
  maxEntries: number,
  advancePerGroup = 2,
): SuggestedOption[] {
  if (maxEntries < 2 || advancePerGroup < 1) return [];

  const candidates: SuggestedOption[] = [];

  // ── Phase 1: power-of-2 knockout sizes (no byes) ──────────────────────────
  const powersOf2 = [2, 4, 8, 16, 32, 64];
  for (const ks of powersOf2) {
    if (ks % advancePerGroup !== 0) continue;          // must divide evenly into groups
    const groupsCount = ks / advancePerGroup;
    if (groupsCount < 2) continue;                     // need ≥2 groups for group stage
    const minGroupSize = Math.floor(maxEntries / groupsCount);
    if (minGroupSize <= advancePerGroup) continue;     // someone doesn't advance → need losers
    const maxGroupSize = Math.ceil(maxEntries / groupsCount);
    if (maxGroupSize > 8) continue;                    // groups too large
    candidates.push({
      groupsCount,
      groupSize: maxGroupSize,
      minGroupSize,
      knockoutTeams: ks,
      byes: 0,
      balance: maxGroupSize - minGroupSize,
    });
  }

  // ── Phase 2: fallback — minimise byes when no power-of-2 solution exists ──
  if (candidates.length === 0) {
    for (let gc = 2; gc <= Math.floor(maxEntries / (advancePerGroup + 1)); gc++) {
      const minGroupSize = Math.floor(maxEntries / gc);
      if (minGroupSize <= advancePerGroup) continue;
      const maxGroupSize = Math.ceil(maxEntries / gc);
      if (maxGroupSize > 8) continue;
      const kt = gc * advancePerGroup;
      const { byes } = deriveBracketSize(kt);
      candidates.push({
        groupsCount: gc,
        groupSize: maxGroupSize,
        minGroupSize,
        knockoutTeams: kt,
        byes,
        balance: maxGroupSize - minGroupSize,
      });
    }
  }

  if (candidates.length === 0) return [];

  // ── Sort: balance ASC → sizePref (|avgSize - 4|) ASC ──────────────────────
  candidates.sort((a, b) => {
    if (a.balance !== b.balance) return a.balance - b.balance;
    const avgA = (a.groupSize + a.minGroupSize) / 2;
    const avgB = (b.groupSize + b.minGroupSize) / 2;
    return Math.abs(avgA - 4) - Math.abs(avgB - 4);
  });

  return candidates.slice(0, 3);
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
