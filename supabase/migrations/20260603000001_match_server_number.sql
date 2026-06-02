-- Track which server (1 or 2) is currently serving within the serving team.
-- Only relevant for traditional / service-points scoring format.
-- NULL = rally scoring (server number not applicable).
-- Resets to 2 at the start of each set (first serving team) per pickleball rules.
ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS server_number SMALLINT
    CHECK (server_number IS NULL OR server_number IN (1, 2));
