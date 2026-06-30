-- The original tournament_entries unique(category_id, player_id) constraint
-- (20250521000002_tenant_layer.sql) predates team events and assumed a
-- player registers at most once per category. Team-event players legitimately
-- need a separate tournament_entries row per rubber they play (e.g. Singles
-- AND Men's Doubles in the same tie, or the same rubber type across multiple
-- ties), all sharing the same category_id/player_id but distinguished by
-- team_id — so the blanket constraint must be scoped to non-team-event rows
-- (team_id is null) rather than dropped outright, preserving the original
-- one-entry-per-player dedup for singles/doubles categories.

alter table tournament_entries drop constraint if exists tournament_entries_category_id_player_id_key;

create unique index if not exists tournament_entries_category_player_uniq
  on tournament_entries (category_id, player_id)
  where team_id is null;
