-- Allow a referee to "send back" a live match for admin re-assignment.
-- When true the match stays in_progress but the admin is shown re-assign controls.
-- Cleared automatically by assignMatchDetailsAction when admin saves new assignment.
alter table matches
  add column if not exists paused_for_reassignment boolean not null default false;
