-- Double-elimination bracket advancement + auto-scheduling support
--
-- winner_to_match_id / loser_to_match_id: explicit next-match links so
--   the scoring action can advance players without positional maths.
-- winner_slot / loser_slot: which side (a|b) the player lands in.
-- bracket_type: 'winners' | 'losers' | 'grand_final' | null (group/rr)

alter table matches
  add column if not exists winner_to_match_id uuid references matches(id) on delete set null,
  add column if not exists loser_to_match_id  uuid references matches(id) on delete set null,
  add column if not exists winner_slot         text check (winner_slot in ('a','b')),
  add column if not exists loser_slot          text check (loser_slot  in ('a','b')),
  add column if not exists bracket_type        text check (bracket_type in ('winners','losers','grand_final'));

create index if not exists matches_winner_next_idx on matches (winner_to_match_id) where winner_to_match_id is not null;
create index if not exists matches_loser_next_idx  on matches (loser_to_match_id)  where loser_to_match_id  is not null;
