-- Store per-group player counts so organisers can control which group
-- gets the extra player when entries don't divide evenly.
-- Nullable — if NULL, draw engine falls back to ceil(max_entries / groups_count).
ALTER TABLE tournament_categories
  ADD COLUMN IF NOT EXISTS group_sizes SMALLINT[] DEFAULT NULL;
