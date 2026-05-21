export function makeId(): string {
  return crypto.randomUUID();
}

export function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

export function roundName(totalRounds: number, currentRound: number): string {
  const roundsFromFinal = totalRounds - currentRound;
  if (roundsFromFinal === 0) return 'Final';
  if (roundsFromFinal === 1) return 'Semi-Final';
  if (roundsFromFinal === 2) return 'Quarter-Final';
  return `Round of ${Math.pow(2, roundsFromFinal + 1)}`;
}
