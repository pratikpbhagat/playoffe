-- Performance: composite indexes for the most frequent query patterns.
-- Each index mirrors the WHERE + ORDER BY clauses of the hottest queries.

-- match_history: player rating history and match feed
-- Covers: .eq('player_id').in('result').order('played_at') and .eq('player_id').order('played_at', desc)
CREATE INDEX IF NOT EXISTS match_history_player_played_at_idx
  ON match_history (player_id, played_at DESC);

CREATE INDEX IF NOT EXISTS match_history_player_result_played_at_idx
  ON match_history (player_id, result, played_at DESC);

-- tournament_entries: per-tournament roster and per-player entry lookup
-- Covers: .eq('tournament_id').eq('player_id') and .eq('tournament_id').eq('status')
CREATE INDEX IF NOT EXISTS tournament_entries_tournament_player_idx
  ON tournament_entries (tournament_id, player_id);

CREATE INDEX IF NOT EXISTS tournament_entries_tournament_status_idx
  ON tournament_entries (tournament_id, status);

-- tournament_entries: per-category entry counts (used on public tournament page)
CREATE INDEX IF NOT EXISTS tournament_entries_category_status_idx
  ON tournament_entries (category_id, status);

-- matches: bracket and scoring queries filtered by category + status
CREATE INDEX IF NOT EXISTS matches_category_status_idx
  ON matches (category_id, status);

-- matches: draw-level queries filtered by tournament
CREATE INDEX IF NOT EXISTS matches_tournament_status_idx
  ON matches (tournament_id, status);

-- player_follows: follower/following counts per player
CREATE INDEX IF NOT EXISTS player_follows_following_id_idx
  ON player_follows (following_id);

CREATE INDEX IF NOT EXISTS player_follows_follower_id_idx
  ON player_follows (follower_id);
