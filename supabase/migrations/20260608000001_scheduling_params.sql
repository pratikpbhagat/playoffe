-- Smart scheduling parameters on tournaments.
-- These columns provide tournament-wide defaults so organisers don't need to
-- configure start time / match duration / changeover per group.
--
-- default_match_duration_mins: auto-derived from scoring_format + num_sets in the app
--   (rally: 10 min/set + 5 changeover, traditional: 20 min/set + 5 changeover)
--   but overridable per scheduling session.
--
-- default_start_time: clock time (HH:MM) when the first match starts on each day.
-- default_changeover_mins: gap between consecutive matches on the same court.

ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS default_match_duration_mins  INTEGER NOT NULL DEFAULT 45,
  ADD COLUMN IF NOT EXISTS default_changeover_mins      INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS default_start_time           TIME    NOT NULL DEFAULT '09:00:00';
