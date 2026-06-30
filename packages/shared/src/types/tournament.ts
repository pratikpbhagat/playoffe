import type { SocialPlatform } from './club';
import type { CategoryTypeValue, PlayFormatValue, DrawFormatValue } from '../constants/category-formats';

export type TournamentStatus = 'draft' | 'registration_open' | 'in_progress' | 'completed' | 'cancelled';

export type PlayFormat = PlayFormatValue;

export type CategoryType = CategoryTypeValue;

export interface Tournament {
  id: string;
  club_id: string;
  name: string;
  description: string | null;
  venue: string | null;
  start_date: string;
  end_date: string;
  status: TournamentStatus;
  court_count: number;
  display_code: string;
  registration_deadline: string | null;
  max_participants: number | null;
  social_post_triggers: SocialPlatform[];
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface RubberLineupItem {
  sequence: number;
  name: string;
  play_format: 'singles' | 'doubles' | 'mixed_doubles';
}

/** A roster quota slot, e.g. { count: 2, gender: 'female', age_min: 35 }.
 *  Enforced as a soft warning only — not a hard registration block. */
export interface RosterCompositionRule {
  count: number;
  gender?: 'male' | 'female';
  age_min?: number;
  age_max?: number;
}

export type DeciderFormat = 'singles' | 'doubles';

export interface TournamentCategory {
  id: string;
  tournament_id: string;
  name: string;
  type: CategoryType;
  play_format: PlayFormat;
  draw_format: DrawFormat;
  status: CategoryStatus;
  max_entries: number | null;
  min_age: number | null;
  max_age: number | null;
  skill_levels: string[];
  rubber_lineup: RubberLineupItem[];
  roster_composition: RosterCompositionRule[];
  decider_format: DeciderFormat | null;
  winner_entry_id: string | null;
  runner_up_entry_id: string | null;
  third_place_entry_id: string | null;
  created_at: string;
}

export type CategoryStatus = 'pending' | 'registration' | 'draw_generated' | 'in_progress' | 'completed';

export type DrawFormat = DrawFormatValue;

export interface TournamentEntry {
  id: string;
  tournament_id: string;
  category_id: string;
  player_id: string;
  partner_id: string | null;
  seed: number | null;
  status: EntryStatus;
  registered_at: string;
}

export type EntryStatus = 'active' | 'withdrawn' | 'provisional';

export interface TournamentTeam {
  id: string;
  tournament_id: string;
  category_id: string;
  name: string;
  captain_id: string;
  marquee_player_id: string | null;
  owner_name: string | null;
  status: EntryStatus;
  seed: number | null;
  registered_at: string;
}

export interface TeamMember {
  id: string;
  team_id: string;
  player_id: string;
  status: EntryStatus;
  invited_at: string;
  responded_at: string | null;
}

export type TieStatus = 'pending_lineups' | 'scheduled' | 'in_progress' | 'awaiting_decider' | 'completed';

export interface Tie {
  id: string;
  tournament_id: string;
  category_id: string;
  round: number;
  round_name: string | null;
  group_name: string | null;
  team_a_id: string | null;
  team_b_id: string | null;
  status: TieStatus;
  winner_team_id: string | null;
  rubbers_won_a: number;
  rubbers_won_b: number;
  points_for_a: number;
  points_against_a: number;
  point_diff_a: number;
  bracket_position: number | null;
  bracket_type: string | null;
  winner_to_tie_id: string | null;
  winner_slot: string | null;
  lineup_a_submitted_at: string | null;
  lineup_b_submitted_at: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface DisplayState {
  tournament_id: string;
  current_slide: DisplaySlide;
  is_pinned: boolean;
  rotation_interval_secs: number;
  active_announcement_id: string | null;
  active_category_filter: string | null;
  is_paused: boolean;
  /** Slides included in the auto-rotation cycle. Defaults to the 5 core slides. */
  enabled_slides?: DisplaySlide[];
  last_updated_by: string | null;
  updated_at: string;
}

export type DisplaySlide =
  | 'live_scores'
  | 'group_standings'
  | 'live_bracket'
  | 'upcoming_matches'
  | 'full_schedule'
  | 'category_podium'
  | 'announcement'
  | 'wrap_up';

export interface Announcement {
  id: string;
  tournament_id: string;
  message: string;
  urgency: 'normal' | 'urgent';
  sent_by: string;
  sent_at: string;
  dismissed_at: string | null;
  also_push_notify: boolean;
}
