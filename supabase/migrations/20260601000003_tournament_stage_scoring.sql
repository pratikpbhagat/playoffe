-- Tournament-level per-stage scoring defaults.
-- Resolution order (most specific wins):
--   1. category_stage_scoring  (per-category per-stage override)
--   2. tournament_stage_scoring (per-tournament per-stage default)  ← this table
--   3. tournament_categories.* (flat category override)
--   4. tournaments.*           (flat tournament default)

CREATE TABLE IF NOT EXISTS tournament_stage_scoring (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id   UUID        NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  stage           TEXT        NOT NULL CHECK (stage IN ('group_stage', 'knockout', 'semifinal', 'final')),
  num_sets        SMALLINT    CHECK (num_sets IS NULL OR num_sets IN (1, 3, 5)),
  points_per_set  SMALLINT    CHECK (points_per_set IS NULL OR points_per_set BETWEEN 5 AND 100),
  win_by          SMALLINT    CHECK (win_by IS NULL OR win_by IN (1, 2)),
  deuce_cap       SMALLINT    CHECK (deuce_cap IS NULL OR deuce_cap >= 5),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tournament_id, stage)
);

-- RLS: managers of the owning club can read/write; public cannot.
ALTER TABLE tournament_stage_scoring ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Club managers can manage tournament stage scoring"
  ON tournament_stage_scoring
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM tournaments t
      JOIN club_managers cm ON cm.club_id = t.club_id
      WHERE t.id = tournament_stage_scoring.tournament_id
        AND cm.player_id = auth.uid()
    )
  );
