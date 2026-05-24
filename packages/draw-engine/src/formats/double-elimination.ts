/**
 * Double Elimination draw generator.
 *
 * Structure for n = 2^k entries:
 *   WB rounds 1..k          – winners bracket (single-elim shell)
 *   LB rounds (k+1)..(3k-2) – losers bracket  (2*(k-1) rounds)
 *   Grand Final round 3k-1  – WB champion vs LB champion
 *
 * Example – 4 entries (k=2):
 *   WB R1 (rd 1)  2 matches → winners advance WB, losers → LB R1
 *   WB Final (rd 2) 1 match → WB champ + loser → LB Final
 *   LB R1 (rd 3)  1 match  (WB R1 losers)
 *   LB Final (rd 4) 1 match (LB R1 winner vs WB Final loser)
 *   Grand Final (rd 5)
 *
 * Example – 8 entries (k=3):
 *   WB R1 (rd 1) 4 matches, WB R2 (rd 2) 2 matches, WB F (rd 3) 1 match
 *   LB R1 (rd 4) 2 matches (WB R1 losers pair up)
 *   LB R2 (rd 5) 2 matches (LB R1 winners vs WB R2 losers)
 *   LB R3 (rd 6) 1 match   (LB R2 winners)
 *   LB F  (rd 7) 1 match   (LB R3 winner vs WB F loser)
 *   Grand Final (rd 8)
 */

import type { DrawConfig, DrawMatch, DrawRound, GeneratedDraw } from '@pickleball/shared';
import { makeId, nextPowerOfTwo } from '../utils';

// ── helpers ────────────────────────────────────────────────────────────────────

function wbRoundName(totalWBRounds: number, round: number): string {
  const r = totalWBRounds - round + 1;
  if (r === 1) return 'WB Final';
  if (r === 2) return 'WB Semi-Final';
  if (r === 3) return 'WB Quarter-Final';
  return `WB Round ${round}`;
}

function lbRoundName(lbRoundLocal: number, totalLBRounds: number): string {
  if (lbRoundLocal === totalLBRounds) return 'LB Final';
  if (lbRoundLocal === totalLBRounds - 1) return 'LB Semi-Final';
  return `LB Round ${lbRoundLocal}`;
}

// ── main export ────────────────────────────────────────────────────────────────

export function doubleElimination(config: DrawConfig): GeneratedDraw {
  const { entries, category_id } = config;
  const bracketSize = nextPowerOfTwo(entries.length);
  const k = Math.log2(bracketSize); // number of WB rounds

  // Seed entries; pad with nulls (byes) to fill bracket
  const seeded = [...entries].sort((a, b) => {
    if (a.seed !== null && b.seed !== null) return a.seed - b.seed;
    if (a.seed !== null) return -1;
    if (b.seed !== null) return 1;
    return b.rating - a.rating;
  });
  const slots = [...seeded, ...Array(bracketSize - seeded.length).fill(null)];

  // ── Pre-allocate all match IDs ─────────────────────────────────────────────

  // WB: round r has bracketSize / 2^r matches (r = 1..k)
  const wbIds: string[][] = [];
  for (let r = 1; r <= k; r++) {
    const count = bracketSize / Math.pow(2, r);
    wbIds.push(Array.from({ length: count }, makeId));
  }

  // LB: 2*(k-1) rounds
  // LB local round lb (1..2*(k-1)):
  //   odd  lb (1,3,5…) = "major" (WB losers drop in + LB survivors)
  //   even lb (2,4,6…) = "minor" (pure LB survivors)
  // match count for LB lb:
  //   LB lb=1: (bracketSize/4) matches    ← WB R1 losers (bracketSize/2) pair up
  //   LB lb=2: (bracketSize/4) matches    ← LB lb=1 winners vs WB R2 losers
  //   LB lb=3: (bracketSize/8) matches    ← LB lb=2 winners play each other
  //   LB lb=4: (bracketSize/8) matches    ← LB lb=3 winners vs WB R3 losers
  //   …
  //   LB lb=2j-1: (bracketSize/2^(j+1)) matches
  //   LB lb=2j:   (bracketSize/2^(j+1)) matches
  const totalLBRounds = 2 * (k - 1);
  const lbIds: string[][] = [];
  for (let lb = 1; lb <= totalLBRounds; lb++) {
    const j = Math.ceil(lb / 2);
    const count = bracketSize / Math.pow(2, j + 1);
    lbIds.push(Array.from({ length: Math.max(1, count) }, makeId));
  }

  // Grand final
  const gfId = makeId();

  // ── Build WB matches ───────────────────────────────────────────────────────

  const allRounds: DrawRound[] = [];

  for (let r = 1; r <= k; r++) {
    const ids = wbIds[r - 1];
    const matches: DrawMatch[] = ids.map((id, pos) => {
      // Entries only in WB R1
      const entryA = r === 1 ? (slots[pos * 2] ?? null) : null;
      const entryB = r === 1 ? (slots[pos * 2 + 1] ?? null) : null;

      // Winner goes to next WB round or Grand Final
      let winnerToMatchId: string | null = null;
      let winnerSlot: 'a' | 'b' | null = null;
      if (r < k) {
        winnerToMatchId = wbIds[r][Math.floor(pos / 2)];
        winnerSlot = pos % 2 === 0 ? 'a' : 'b';
      } else {
        // WB Final winner → Grand Final slot A
        winnerToMatchId = gfId;
        winnerSlot = 'a';
      }

      // Loser goes to the LB
      let loserToMatchId: string | null = null;
      let loserSlot: 'a' | 'b' | null = null;
      if (r === 1) {
        // WB R1 losers pair up in LB R1
        // Two adjacent WB R1 losers share one LB R1 match
        const lbPos = Math.floor(pos / 2);
        loserToMatchId = lbIds[0][lbPos];
        loserSlot = pos % 2 === 0 ? 'a' : 'b';
      } else if (r < k) {
        // WB round r (2..k-1) loser drops into LB round 2*(r-1)
        // (the even LB round that corresponds to this WB round)
        const lbLocalRound = 2 * (r - 1); // 2, 4, 6, …
        const lbRoundIdx = lbLocalRound - 1; // 0-indexed
        loserToMatchId = lbIds[lbRoundIdx][pos]; // same position, slot B
        loserSlot = 'b';
      } else {
        // WB Final loser drops into LB Final (last LB round)
        loserToMatchId = lbIds[totalLBRounds - 1][0];
        loserSlot = 'b';
      }

      return {
        id,
        round: r,
        round_name: wbRoundName(k, r),
        group_name: null,
        entry_a: entryA,
        entry_b: entryB,
        winner_advances_to: winnerToMatchId,
        loser_advances_to: loserToMatchId,
        // Extra fields for DB storage (picked up by generateDrawAction)
        _winner_to_match_id: winnerToMatchId,
        _winner_slot: winnerSlot,
        _loser_to_match_id: loserToMatchId,
        _loser_slot: loserSlot,
        _bracket_type: 'winners',
      } as DrawMatch & Record<string, unknown>;
    });

    allRounds.push({ round: r, round_name: wbRoundName(k, r), matches });
  }

  // ── Build LB matches ───────────────────────────────────────────────────────

  for (let lb = 1; lb <= totalLBRounds; lb++) {
    const absoluteRound = k + lb;
    const ids = lbIds[lb - 1];
    const name = lbRoundName(lb, totalLBRounds);

    const matches: DrawMatch[] = ids.map((id, pos) => {
      // Determine advancement
      let winnerToMatchId: string | null = null;
      let winnerSlot: 'a' | 'b' | null = null;

      if (lb < totalLBRounds) {
        // Winner goes to next LB round
        if (lb % 2 === 1) {
          // Odd LB round (major) – winner advances to next (even) LB round at same position, slot A
          winnerToMatchId = lbIds[lb][pos]; // next LB round idx = lb (0-indexed)
          winnerSlot = 'a';
        } else {
          // Even LB round (minor) – winners pair up in next odd LB round
          winnerToMatchId = lbIds[lb][Math.floor(pos / 2)];
          winnerSlot = pos % 2 === 0 ? 'a' : 'b';
        }
      } else {
        // LB Final winner → Grand Final slot B
        winnerToMatchId = gfId;
        winnerSlot = 'b';
      }

      return {
        id,
        round: absoluteRound,
        round_name: name,
        group_name: null,
        entry_a: null,
        entry_b: null,
        winner_advances_to: winnerToMatchId,
        loser_advances_to: null,
        _winner_to_match_id: winnerToMatchId,
        _winner_slot: winnerSlot,
        _loser_to_match_id: null,
        _loser_slot: null,
        _bracket_type: 'losers',
      } as DrawMatch & Record<string, unknown>;
    });

    allRounds.push({ round: absoluteRound, round_name: name, matches });
  }

  // ── Grand Final ────────────────────────────────────────────────────────────

  const gfRound = k + totalLBRounds + 1;
  const gfMatch: DrawMatch & Record<string, unknown> = {
    id: gfId,
    round: gfRound,
    round_name: 'Grand Final',
    group_name: null,
    entry_a: null,
    entry_b: null,
    winner_advances_to: null,
    loser_advances_to: null,
    _winner_to_match_id: null,
    _winner_slot: null,
    _loser_to_match_id: null,
    _loser_slot: null,
    _bracket_type: 'grand_final',
  };

  allRounds.push({ round: gfRound, round_name: 'Grand Final', matches: [gfMatch] });

  // ── Auto-advance byes in WB R1 ─────────────────────────────────────────────
  // (The generateDrawAction handles this after insertion)

  return {
    format: 'double_elimination',
    category_id,
    rounds: allRounds,
    generated_at: new Date().toISOString(),
  };
}
