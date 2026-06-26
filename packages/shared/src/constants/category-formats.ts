export const CATEGORY_TYPES = [
  { value: 'open', label: 'Open' },
  { value: 'pro', label: 'Pro' },
  { value: 'advanced', label: 'Advanced' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'beginner', label: 'Beginner' },
] as const;

export const PLAY_FORMATS = [
  { value: 'singles', label: 'Singles' },
  { value: 'doubles', label: 'Doubles' },
  { value: 'mixed_doubles', label: 'Mixed Doubles' },
  { value: 'team_event', label: 'Team event' },
] as const;

export const DRAW_FORMATS = [
  { value: 'group_stage_knockout', label: 'Group Stage + Knockout' },
  { value: 'round_robin', label: 'Round Robin' },
  { value: 'single_elimination', label: 'Single Elimination' },
] as const;

export type CategoryTypeValue = (typeof CATEGORY_TYPES)[number]['value'];
export type PlayFormatValue = (typeof PLAY_FORMATS)[number]['value'];
export type DrawFormatValue = (typeof DRAW_FORMATS)[number]['value'];
