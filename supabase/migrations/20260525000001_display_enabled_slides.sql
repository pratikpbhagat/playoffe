-- Add enabled_slides to display_state so organisers can choose which slides
-- participate in the auto-rotation cycle from the Display Control panel.

alter table display_state
  add column if not exists enabled_slides display_slide_enum[] not null
  default array[
    'live_scores',
    'upcoming_matches',
    'group_standings',
    'live_bracket',
    'full_schedule'
  ]::display_slide_enum[];

-- Back-fill existing rows (DEFAULT handles new rows; this covers rows created
-- before the column existed, e.g. in dev environments restored from a dump).
update display_state
  set enabled_slides = array[
    'live_scores',
    'upcoming_matches',
    'group_standings',
    'live_bracket',
    'full_schedule'
  ]::display_slide_enum[]
  where array_length(enabled_slides, 1) is null;

comment on column display_state.enabled_slides is
  'Slides included in the auto-rotation cycle. Organisers toggle these in Display Control.';
