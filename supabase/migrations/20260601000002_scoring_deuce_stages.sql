-- ── Deuce / golden-point fields on existing scoring columns ──────────────────

-- Tournaments: default win-by-2 (standard deuce), no cap by default
ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS win_by    SMALLINT NOT NULL DEFAULT 2
    CHECK (win_by IN (1, 2)),
  ADD COLUMN IF NOT EXISTS deuce_cap SMALLINT
    CHECK (deuce_cap IS NULL OR deuce_cap >= 5);

-- Tournament categories: nullable so NULL = inherit from tournament
ALTER TABLE tournament_categories
  ADD COLUMN IF NOT EXISTS win_by    SMALLINT
    CHECK (win_by IS NULL OR win_by IN (1, 2)),
  ADD COLUMN IF NOT EXISTS deuce_cap SMALLINT
    CHECK (deuce_cap IS NULL OR deuce_cap >= 5);

-- ── Per-stage scoring overrides ───────────────────────────────────────────────
-- Each row overrides scoring for one stage within a category.
-- NULL on any field means "inherit from category / tournament default".

CREATE TABLE IF NOT EXISTS category_stage_scoring (
  id             UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id    UUID     NOT NULL REFERENCES tournament_categories(id) ON DELETE CASCADE,
  stage          TEXT     NOT NULL
    CHECK (stage IN ('group_stage', 'knockout', 'semifinal', 'final')),
  num_sets       SMALLINT CHECK (num_sets IS NULL OR num_sets IN (1, 3, 5)),
  points_per_set SMALLINT CHECK (points_per_set IS NULL OR points_per_set BETWEEN 5 AND 100),
  win_by         SMALLINT CHECK (win_by IS NULL OR win_by IN (1, 2)),
  deuce_cap      SMALLINT CHECK (deuce_cap IS NULL OR deuce_cap >= 5),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (category_id, stage)
);

ALTER TABLE category_stage_scoring ENABLE ROW LEVEL SECURITY;

-- Readable by anyone (scoring display, public draw pages)
CREATE POLICY "css_select" ON category_stage_scoring FOR SELECT USING (true);
-- Write restricted to authenticated users (admin client bypasses RLS anyway)
CREATE POLICY "css_insert" ON category_stage_scoring FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "css_update" ON category_stage_scoring FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "css_delete" ON category_stage_scoring FOR DELETE USING (auth.role() = 'authenticated');

COMMENT ON TABLE category_stage_scoring IS
  'Per-stage scoring overrides within a category. NULL fields inherit from category or tournament defaults.';
COMMENT ON COLUMN category_stage_scoring.stage IS
  'group_stage | knockout | semifinal | final';
COMMENT ON COLUMN tournaments.win_by IS
  '1 = golden point immediately on tie; 2 = must win by 2 (advantage/deuce)';
COMMENT ON COLUMN tournaments.deuce_cap IS
  'Absolute score at which advantage switches to golden point. NULL = no cap.';
