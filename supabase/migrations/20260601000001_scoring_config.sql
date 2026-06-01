-- Scoring configuration on tournaments (default for all categories)
ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS scoring_format  TEXT     NOT NULL DEFAULT 'rally'
    CHECK (scoring_format IN ('rally', 'traditional')),
  ADD COLUMN IF NOT EXISTS num_sets        SMALLINT NOT NULL DEFAULT 1
    CHECK (num_sets IN (1, 3, 5)),
  ADD COLUMN IF NOT EXISTS points_per_set  SMALLINT NOT NULL DEFAULT 11
    CHECK (points_per_set >= 5 AND points_per_set <= 100);

-- Per-category scoring override (when enabled, these values take precedence)
ALTER TABLE tournament_categories
  ADD COLUMN IF NOT EXISTS scoring_override  BOOLEAN  NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS scoring_format    TEXT
    CHECK (scoring_format IS NULL OR scoring_format IN ('rally', 'traditional')),
  ADD COLUMN IF NOT EXISTS num_sets          SMALLINT
    CHECK (num_sets IS NULL OR num_sets IN (1, 3, 5)),
  ADD COLUMN IF NOT EXISTS points_per_set    SMALLINT
    CHECK (points_per_set IS NULL OR (points_per_set >= 5 AND points_per_set <= 100));

COMMENT ON COLUMN tournaments.scoring_format  IS 'rally = every rally scores; traditional = service-side scoring only';
COMMENT ON COLUMN tournaments.num_sets        IS '1, 3, or 5 — first to win majority takes the match';
COMMENT ON COLUMN tournaments.points_per_set  IS 'Points needed to win a set (e.g. 11, 15, 21)';
COMMENT ON COLUMN tournament_categories.scoring_override IS 'When true this category uses its own scoring_format/num_sets/points_per_set instead of the tournament default';
