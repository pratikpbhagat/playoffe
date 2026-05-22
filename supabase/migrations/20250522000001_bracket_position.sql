-- Add bracket_position to matches so we can advance winners without storing
-- a separate winner_advances_to foreign key. Position is 0-indexed within each round.

alter table matches add column if not exists bracket_position integer;

create index if not exists matches_bracket_idx
  on matches (category_id, round, bracket_position);
