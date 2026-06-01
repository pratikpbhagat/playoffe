-- Group stage draw configuration columns
-- groups_count      : how many groups (NULL = auto-calculate at draw time)
-- advance_per_group : how many players advance from each group to knockout (default 2)
-- has_third_place_match : whether to play a bronze-medal match between semi-final losers

ALTER TABLE tournament_categories
  ADD COLUMN IF NOT EXISTS groups_count        SMALLINT CHECK (groups_count IS NULL OR groups_count > 0),
  ADD COLUMN IF NOT EXISTS advance_per_group   SMALLINT NOT NULL DEFAULT 2 CHECK (advance_per_group > 0),
  ADD COLUMN IF NOT EXISTS has_third_place_match BOOLEAN NOT NULL DEFAULT false;
