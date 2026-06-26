import type { DrawFormat } from './tournament';

/** Draw-engine's supported formats — a superset of the DB-facing DrawFormat.
 *  double_elimination/swiss have working generators here but aren't currently
 *  selectable via the DB enum or any UI dropdown. */
export type EngineDrawFormat = DrawFormat | 'double_elimination' | 'swiss';

export interface DrawConfig {
  format: EngineDrawFormat;
  entries: DrawEntry[];
  category_id: string;
  group_size?: number;
  /** Per-group sizes (ordered). When provided, overrides group_size and allows
   *  uneven groups — e.g. [6, 5, 5, 5] for 21 entries in 4 groups. */
  group_sizes?: number[];
  groups_per_page?: number;
  top_per_group_advance?: number;
  min_rest_minutes?: number;
  /** Whether to generate a 3rd-place (bronze) match for the knockout phase.
   *  Defaults to true for single_elimination (backward-compat).
   *  Explicitly set to false to suppress it. */
  has_third_place_match?: boolean;
  /** For group_stage_knockout: 'auto' (default) generates the full knockout
   *  bracket with byes when groups × advance isn't a power of 2. 'manual'
   *  generates only the group stage — knockout matches are created later by
   *  the organiser via the Knockout Builder. */
  knockout_seeding?: 'auto' | 'manual';
}

export interface DrawEntry {
  entry_id: string;
  player_ids: string[];
  display_name: string;
  seed: number | null;
  rating: number;
}

export interface GeneratedDraw {
  format: EngineDrawFormat;
  category_id: string;
  rounds: DrawRound[];
  groups?: DrawGroup[];
  generated_at: string;
}

export interface DrawRound {
  round: number;
  round_name: string;
  matches: DrawMatch[];
}

export interface DrawMatch {
  id: string;
  round: number;
  round_name: string;
  group_name: string | null;
  entry_a: DrawEntry | null;
  entry_b: DrawEntry | null;
  winner_advances_to: string | null;
  loser_advances_to: string | null;
}

export interface DrawGroup {
  name: string;
  entries: DrawEntry[];
  matches: DrawMatch[];
}
