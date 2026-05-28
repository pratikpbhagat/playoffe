-- Track when a referee was assigned to a match so the referee landing page
-- can show matches in assignment order (oldest assignment = highest priority).
alter table matches
  add column if not exists assigned_at timestamptz;
