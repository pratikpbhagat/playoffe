-- Track which team serves first in a match.
-- Set when the match is started (by admin or referee).
-- NULL means serving was not recorded.
ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS serving_entry_id UUID REFERENCES tournament_entries(id);
