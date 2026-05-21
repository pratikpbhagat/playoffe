export type MatchStatus =
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  | 'disputed'
  | 'walkover'
  | 'retired';

export interface Match {
  id: string;
  category_id: string;
  tournament_id: string;
  round: number;
  round_name: string | null;
  group_name: string | null;
  entry_a_id: string | null;
  entry_b_id: string | null;
  court: number | null;
  scheduled_time: string | null;
  status: MatchStatus;
  sets: MatchSet[];
  winner_entry_id: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface MatchSet {
  set_number: number;
  score_a: number;
  score_b: number;
}

export interface ScoreSubmission {
  id: string;
  match_id: string;
  submitted_by: string;
  submitter_role: 'referee' | 'organizer' | 'player';
  sets: MatchSet[];
  submitted_at: string;
  is_confirmed: boolean;
  confirmed_by: string | null;
  confirmed_at: string | null;
}

export interface MatchHistory {
  id: string;
  player_id: string;
  match_id: string;
  tournament_id: string;
  club_id: string;
  result: 'win' | 'loss' | 'walkover_win' | 'walkover_loss';
  sets: MatchSet[];
  opponent_entry_id: string | null;
  rating_before: number;
  rating_after: number;
  rating_change: number;
  played_at: string;
}

export interface CourtSchedule {
  court: number;
  tournament_id: string;
  date: string;
  available_from: string;
  available_until: string;
}

export interface TournamentRefereePin {
  id: string;
  tournament_id: string;
  pin_hash: string;
  label: string | null;
  created_by: string;
  created_at: string;
  expires_at: string;
  is_revoked: boolean;
}
