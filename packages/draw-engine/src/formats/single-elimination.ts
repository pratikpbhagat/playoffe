import type { DrawConfig, GeneratedDraw, DrawMatch, DrawRound } from '@pickleball/shared';
import { makeId, nextPowerOfTwo, roundName } from '../utils';

export function singleElimination(config: DrawConfig): GeneratedDraw {
  const { entries, category_id } = config;
  const bracketSize = nextPowerOfTwo(entries.length);
  const byes = bracketSize - entries.length;

  const slots = [...entries, ...Array(byes).fill(null)];
  const matchIds: string[][] = [];
  const rounds: DrawRound[] = [];
  const totalRounds = Math.log2(bracketSize);
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

  // ── 3rd place match ──────────────────────────────────────────────────────────
  // Only meaningful when there are at least 4 entries (i.e. there is a semifinal
  // round before the final).  The two semifinal losers play for bronze.
  // has_third_place_match defaults to true (undefined) for backward-compat with
  // standalone single-elimination draws.  group_stage_knockout passes it explicitly.
  const shouldHaveThirdPlace = config.has_third_place_match !== false;
  if (totalRounds >= 2 && shouldHaveThirdPlace) {
    const finalRound = totalRounds; // 1-based round number of the Final
    const semifinalRoundIndex = finalRound - 1; // round index of the Semis

    // Find the round object that holds the semifinal matches
    const semifinalRound = rounds.find((r) => r.round === semifinalRoundIndex);

    if (semifinalRound && semifinalRound.matches.length === 2) {
      const thirdPlaceId = makeId();

      // Tag the 3rd place match with the bracket_type the DB + finalize action expect.
      // Extended properties (prefixed with _) are picked up by generateDrawAction via `as any`.
      const thirdPlaceMatch = Object.assign(
        {
          id: thirdPlaceId,
          round: finalRound,
          round_name: '3rd Place',
          group_name: null,
          entry_a: null,
          entry_b: null,
          winner_advances_to: null,
          loser_advances_to: null,
        } satisfies DrawMatch,
        {
          _bracket_type: 'third_place',
          _winner_to_match_id: null,
          _loser_to_match_id: null,
          _winner_slot: null,
          _loser_slot: null,
        },
      );

      // Wire the two semifinalists' losers into the 3rd place match
      const [semi1, semi2] = semifinalRound.matches;
      const s1 = semi1 as DrawMatch & Record<string, unknown>;
      const s2 = semi2 as DrawMatch & Record<string, unknown>;
      s1._loser_to_match_id = thirdPlaceId;
      s1._loser_slot = 'a';
      s2._loser_to_match_id = thirdPlaceId;
      s2._loser_slot = 'b';

      // Append the 3rd place match to the final round (alongside the main final)
      const finalRoundObj = rounds.find((r) => r.round === finalRound);
      if (finalRoundObj) {
        finalRoundObj.matches.push(thirdPlaceMatch as unknown as DrawMatch);
      }
    }
  }

  return { format: 'single_elimination', category_id, rounds, generated_at: new Date().toISOString() };
}
