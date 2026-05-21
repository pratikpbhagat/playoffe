export type Gender = 'male' | 'female' | 'other';

export type PlayerRole = 'player' | 'organizer' | 'club_manager' | 'referee' | 'sponsor' | 'admin';

export interface Player {
  id: string;
  email: string;
  username: string;
  full_name: string;
  gender: Gender;
  dob: string | null;
  photo_url: string | null;
  location: string | null;
  role: PlayerRole;
  is_provisional: boolean;
  provisional_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlayerProfile {
  player_id: string;
  bio: string | null;
  headline: string | null;
  career_history: CareerEntry[];
  certifications: Certification[];
  playing_since: number | null;
  preferred_style: string | null;
}

export interface CareerEntry {
  club_id: string | null;
  club_name: string;
  role: 'player' | 'captain' | 'coach';
  from_year: number;
  to_year: number | null;
  description: string | null;
}

export interface Certification {
  id: string;
  name: string;
  issuing_body: string;
  year: number;
  expiry_year: number | null;
  proof_url: string | null;
  is_active: boolean;
}

export interface GlobalStats {
  player_id: string;
  total_matches: number;
  wins: number;
  losses: number;
  win_rate: number;
  current_rating: number;
  peak_rating: number;
  singles_matches: number;
  singles_wins: number;
  doubles_matches: number;
  doubles_wins: number;
  mixed_doubles_matches: number;
  mixed_doubles_wins: number;
  updated_at: string;
}

export interface GlobalRanking {
  player_id: string;
  category: RankingCategory;
  rank: number;
  points: number;
  last_updated: string;
  window_start: string;
}

export type RankingCategory =
  | 'singles_open'
  | 'singles_a'
  | 'singles_b'
  | 'singles_c'
  | 'doubles_open'
  | 'doubles_a'
  | 'doubles_b'
  | 'mixed_doubles_open'
  | 'mixed_doubles_a';
