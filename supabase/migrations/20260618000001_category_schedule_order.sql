-- Per-category scheduling order: which day a category's matches should run
-- on, and what order it should be scheduled relative to other categories on
-- that same day. Drag-and-drop ordering UI on the schedule page writes these;
-- the schedule generator reads them to chain categories sequentially per day.
alter table tournament_categories
  add column if not exists schedule_day date,
  add column if not exists schedule_order integer not null default 0;

create index if not exists tournament_categories_schedule_order_idx
  on tournament_categories (tournament_id, schedule_day, schedule_order);
