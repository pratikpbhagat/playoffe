-- The "_service_write" policies added in 20260627000001_team_events.sql used
-- `for all using (true)`, which grants unrestricted write access to every
-- Postgres role — including unauthenticated `anon` — not just the service
-- role. All actual writes to these tables go through server actions using
-- the admin (service-role) client (apps/web/src/lib/actions/teams.ts,
-- draws.ts, scoring.ts, referee.ts, and app/api/teams/import/route.ts),
-- which bypasses RLS entirely and needs no policy. Drop the blanket
-- policies rather than scope them — there's no legitimate end-user write
-- path to these tables to scope a check against.
drop policy if exists "teams_service_write" on tournament_teams;
drop policy if exists "team_members_service_write" on team_members;
drop policy if exists "ties_service_write" on ties;
