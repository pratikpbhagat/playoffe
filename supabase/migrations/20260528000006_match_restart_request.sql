-- Allows a referee to flag an accidentally-completed match for restart.
-- Admin approves via approveMatchRestartAction → match resets to 'scheduled'
-- (court and referee cleared) and re-enters the upcoming queue.
alter table matches
  add column if not exists restart_requested boolean not null default false,
  add column if not exists restart_requested_reason text;
