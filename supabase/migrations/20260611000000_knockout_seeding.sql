ALTER TABLE tournament_categories
  ADD COLUMN IF NOT EXISTS knockout_seeding TEXT NOT NULL DEFAULT 'auto'
  CHECK (knockout_seeding IN ('auto', 'manual'));
