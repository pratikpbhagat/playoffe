-- Allow 'third_place' as a valid bracket_type for single-elimination 3rd place matches
-- The draw engine generates a third-place match with bracket_type = 'third_place',
-- but the original constraint only permitted 'winners', 'losers', 'grand_final'.
alter table matches
  drop constraint if exists matches_bracket_type_check;

alter table matches
  add constraint matches_bracket_type_check
    check (bracket_type in ('winners', 'losers', 'grand_final', 'third_place'));
