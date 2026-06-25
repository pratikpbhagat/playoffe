// Pure scheduling utilities + shared types.
// No 'use server' directive — safe to import on both client and server.
// Extracted from scheduling.ts because 'use server' files require all exports to be async.

// ── Shared types (also re-used in the server action file) ────────────────────

export interface ScheduleUpdate {
  matchId: string;
  scheduledTime: string | null; // ISO UTC, or null to clear
  court: number | null;
}

export interface ConflictInfo {
  matchId: string;
  message: string;
}

export interface SmartScheduleParams {
  startDatetime: string;
  matchDurationMins: number;
  changeoverMins: number;
  knockoutBufferMins: number;
  availableCourts: number[];
}

/**
 * Computes expected match duration from scoring format + number of sets.
 * Rally points:        10 min/set + changeover
 * Traditional/service: 20 min/set + changeover
 */
export function computeMatchDurationMins(params: {
  scoringFormat: 'rally' | 'traditional';
  numSets: number;
  changeoverMins?: number;
}): number {
  const perSet     = params.scoringFormat === 'rally' ? 10 : 20;
  const changeover = params.changeoverMins ?? 5;
  return params.numSets * perSet + Math.max(0, params.numSets - 1) * changeover;
}

/**
 * Resolves a category's effective match duration — categories can override
 * the tournament's scoring format/set count (e.g. singles best-of-3 vs.
 * doubles best-of-1), so a tournament-wide duration isn't always accurate.
 */
export function resolveCategoryDurationMins(
  category: {
    scoring_override?: boolean | null;
    scoring_format?: string | null;
    num_sets?: number | null;
  } | null | undefined,
  tournamentDefaults: { scoringFormat: 'rally' | 'traditional'; numSets: number },
  changeoverMins: number,
): number {
  const scoringFormat = ((category?.scoring_override ? category.scoring_format : null) ?? tournamentDefaults.scoringFormat) as 'rally' | 'traditional';
  const numSets = (category?.scoring_override ? category.num_sets : null) ?? tournamentDefaults.numSets;
  return computeMatchDurationMins({ scoringFormat, numSets, changeoverMins });
}

/**
 * Detects scheduling conflicts from a proposed set of updates.
 * - Same court + overlapping time window → both matches flagged
 * - Court number outside availableCourts → flagged
 *
 * `matchDurationMins` can be a single number (every match assumed the same
 * duration) or a per-match lookup — different categories often run different
 * scoring formats/set counts, so a fixed duration would mis-detect overlaps.
 */
export function detectConflictsFromUpdates(
  updates: ScheduleUpdate[],
  matchDurationMins: number | Map<string, number>,
  availableCourts?: number[],
): ConflictInfo[] {
  const conflicts: ConflictInfo[] = [];
  const scheduled = updates.filter((u) => u.scheduledTime && u.court);

  function durationFor(matchId: string): number {
    return typeof matchDurationMins === 'number'
      ? matchDurationMins
      : (matchDurationMins.get(matchId) ?? 30);
  }

  for (let i = 0; i < scheduled.length; i++) {
    const a      = scheduled[i];
    const aStart = new Date(a.scheduledTime!).getTime();
    const aEnd   = aStart + durationFor(a.matchId) * 60_000;

    // Out-of-range court
    if (availableCourts && !availableCourts.includes(a.court!)) {
      conflicts.push({ matchId: a.matchId, message: `Court ${a.court} is not available` });
      continue;
    }

    for (let j = i + 1; j < scheduled.length; j++) {
      const b      = scheduled[j];
      if (a.court !== b.court) continue;

      const bStart = new Date(b.scheduledTime!).getTime();
      const bEnd   = bStart + durationFor(b.matchId) * 60_000;

      // Overlap: A starts before B ends AND B starts before A ends
      if (aStart < bEnd && bStart < aEnd) {
        const fmt = (ms: number) =>
          new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        conflicts.push({
          matchId: a.matchId,
          message: `Overlaps on court ${a.court} with another match at ${fmt(bStart)}`,
        });
        conflicts.push({
          matchId: b.matchId,
          message: `Overlaps on court ${b.court} with another match at ${fmt(aStart)}`,
        });
      }
    }
  }

  // Deduplicate — keep first message per match
  const seen = new Set<string>();
  return conflicts.filter((c) => {
    if (seen.has(c.matchId)) return false;
    seen.add(c.matchId);
    return true;
  });
}
