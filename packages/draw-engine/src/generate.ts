import type { DrawConfig, GeneratedDraw } from '@pickleball/shared';
import { roundRobin } from './formats/round-robin';
import { singleElimination } from './formats/single-elimination';
import { doubleElimination } from './formats/double-elimination';
import { groupStageKnockout } from './formats/group-stage-knockout';
import { swiss } from './formats/swiss';

export function generateDraw(config: DrawConfig): GeneratedDraw {
  const seeded = seedEntries(config.entries);
  const configWithSeeded = { ...config, entries: seeded };

  switch (config.format) {
    case 'round_robin':
      return roundRobin(configWithSeeded);
    case 'single_elimination':
      return singleElimination(configWithSeeded);
    case 'double_elimination':
      return doubleElimination(configWithSeeded);
    case 'group_stage_knockout':
      return groupStageKnockout(configWithSeeded);
    case 'swiss':
      return swiss(configWithSeeded);
    default:
      throw new Error(`Unknown draw format: ${config.format}`);
  }
}

function seedEntries(entries: DrawConfig['entries']): DrawConfig['entries'] {
  const withSeed = entries.filter((e) => e.seed !== null).sort((a, b) => (a.seed ?? 0) - (b.seed ?? 0));
  const withoutSeed = entries.filter((e) => e.seed === null).sort(() => Math.random() - 0.5);
  return [...withSeed, ...withoutSeed];
}
