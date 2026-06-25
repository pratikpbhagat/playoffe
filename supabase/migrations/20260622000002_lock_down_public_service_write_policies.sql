-- Follow-up to 20260622000001: a full pg_policies sweep found the exact same
-- mistake repeated across the schema — a policy *named* "..._service_write"
-- (or similar), clearly intended to mean "only our backend's service-role
-- client can write here," but actually defined with no role restriction
-- (defaults to the `public` pseudo-role, which covers every Postgres role
-- including unauthenticated `anon`) and `USING (true)`. The service role
-- bypasses RLS entirely and was never the one this policy was restricting —
-- it was granting public write access by mistake every time.
--
-- Verified against application code before touching each one: every actual
-- write call in apps/web/src/lib/actions/*.ts already goes through
-- createAdminClient() (service role) for every one of these tables, so
-- dropping the public policy changes nothing for legitimate app behavior —
-- it only removes the ability to write to these tables directly via the
-- public anon/authenticated Supabase client key.
--
-- tournament_entries  — entries_service_write (ALL, true): anyone could
--   insert themselves into any category, edit/withdraw any entry, or
--   delete entries outright. Most severe of this batch.
-- match_history       — history_service_write (ALL, true): anyone could
--   tamper with completed-match rating history.
-- global_rankings     — rankings_service_write (ALL, true): unused by any
--   current app code; locking down pre-emptively.
-- club_affiliations   — affiliations_service_write (ALL, true): anyone
--   could add/remove themselves (or anyone else) from any club's roster.
-- display_sessions    — display_sessions_open_write (ALL, true): unused by
--   any current app code; locking down pre-emptively.
-- clubs               — clubs_service_insert (INSERT, true): anyone could
--   create arbitrary club rows directly, bypassing app-level slug/limit
--   logic in createClubAction.
-- players             — players_service_insert (INSERT, true): anyone
--   could insert arbitrary players rows.

DROP POLICY IF EXISTS "entries_service_write" ON tournament_entries;
DROP POLICY IF EXISTS "history_service_write" ON match_history;
DROP POLICY IF EXISTS "rankings_service_write" ON global_rankings;
DROP POLICY IF EXISTS "affiliations_service_write" ON club_affiliations;
DROP POLICY IF EXISTS "display_sessions_open_write" ON display_sessions;
DROP POLICY IF EXISTS "clubs_service_insert" ON clubs;
DROP POLICY IF EXISTS "players_service_insert" ON players;

-- player_profiles is the one exception in this batch: profile.ts's
-- updateProfileAction() upserts a row via the user's own session client
-- (not the admin client), always with player_id = the caller's own
-- auth.uid(). So instead of dropping this one, rescope it to ownership —
-- matching the existing profiles_own_update policy — rather than removing
-- write access a real feature depends on.
DROP POLICY IF EXISTS "profiles_service_insert" ON player_profiles;
CREATE POLICY "profiles_own_insert" ON player_profiles FOR INSERT
  WITH CHECK (auth.uid() = player_id);
