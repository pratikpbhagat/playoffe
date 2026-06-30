-- A team's default lineup (one player/pair per rubber) — settable from the
-- Registrations page so the organizer doesn't have to re-enter the same
-- lineup for every tie. When `default_lineup_enabled` is true, the default
-- is auto-applied to every not-yet-started rubber the team plays, both
-- immediately (existing ties, server action) and going forward (newly
-- created ties from draw generation / group-stage promotion).
alter table tournament_teams add column if not exists default_lineup jsonb not null default '[]';
alter table tournament_teams add column if not exists default_lineup_enabled boolean not null default false;
