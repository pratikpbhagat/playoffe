-- Development seed data
-- Run: supabase db reset (applies migrations + this seed)

-- Sample club
insert into clubs (id, name, slug, brand_primary_color, brand_secondary_color, city, country, subscription_tier)
values (
  '00000000-0000-0000-0000-000000000001',
  'Sydney Pickleball Club',
  'sydney-pickleball',
  '#16a34a',
  '#15803d',
  'Sydney',
  'Australia',
  'pro'
);

-- Sample tournament (display code set by trigger)
insert into tournaments (id, club_id, name, venue, start_date, end_date, status, court_count, created_by)
values (
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000001',
  'Summer Open 2025',
  'Sydney Olympic Park',
  '2025-12-15',
  '2025-12-15',
  'in_progress',
  4,
  '00000000-0000-0000-0000-000000000099'
);

-- Sample categories
insert into tournament_categories (id, tournament_id, name, type, play_format, draw_format, status)
values
  ('00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000010',
   'Men''s Singles A', 'skill', 'singles', 'single_elimination', 'in_progress'),
  ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000010',
   'Mixed Doubles Open', 'open', 'mixed_doubles', 'group_stage_knockout', 'in_progress');
