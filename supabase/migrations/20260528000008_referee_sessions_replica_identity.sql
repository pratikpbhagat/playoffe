-- Fix Realtime event delivery for referee_sessions and tournament_referee_pins.
--
-- Problems:
--
-- 1. referee_sessions was added to supabase_realtime publication but was missing
--    REPLICA IDENTITY FULL. Supabase Realtime requires FULL identity for
--    filtered subscriptions on non-primary-key columns (e.g. tournament_id).
--    Without it, the filter silently receives no events — a referee checking in
--    only appears in the Active Referees list after a manual page refresh.
--
-- 2. tournament_referee_pins was never added to the supabase_realtime publication
--    at all, and was also missing REPLICA IDENTITY FULL. This prevents the
--    assignable-referees dropdown (ActiveRefereesProvider) from updating in
--    real-time when the admin creates or revokes PINs.
--
-- The same pattern is already applied to the matches table
-- (see migration 20250524000003_enable_realtime_matches.sql).

-- Fix referee_sessions (already in publication, needs FULL identity)
ALTER TABLE referee_sessions REPLICA IDENTITY FULL;

-- Fix tournament_referee_pins (not in publication, needs both)
ALTER TABLE tournament_referee_pins REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE tournament_referee_pins;
