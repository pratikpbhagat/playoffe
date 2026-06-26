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
