-- ============================================================
-- Seed: Advance Men's Doubles upto DUPR 5.0 — 32 Teams
-- Tournament: Blue Bird Club Championships 2026
-- Category ID: 1cbd65a4-f18a-453f-84ea-5ddc1664c4db
-- Uses d2 UUID namespace to avoid conflicts with existing players
-- ============================================================

DO $$
DECLARE
  v_cat_id    constant uuid := '1cbd65a4-f18a-453f-84ea-5ddc1664c4db';
  v_tourn_id  constant uuid := 'dbee83cf-85fd-43c5-97ee-c7686b3b3f3a';

  i           integer;
  v_pid       uuid;
  v_pid2      uuid;

  -- 64 names — every consecutive pair forms one doubles team
  v_names text[] := ARRAY[
    -- Team 1
    'Marcus Chen',       'Ravi Patel',
    -- Team 2
    'Tyler Brooks',      'Jordan Hicks',
    -- Team 3
    'Devon Clarke',      'Marcus Williams',
    -- Team 4
    'Raj Sharma',        'Anish Kapoor',
    -- Team 5
    'Blake Sullivan',    'Chase Morgan',
    -- Team 6
    'Scott Bennett',     'Chad Nelson',
    -- Team 7
    'Graham Butler',     'Colin Wright',
    -- Team 8
    'Preston Jenkins',   'Garrett Ross',
    -- Team 9
    'Nolan Richardson',  'Carter Simmons',
    -- Team 10
    'Jared Hall',        'Parker Stone',
    -- Team 11
    'Lance Wagner',      'Evan Perry',
    -- Team 12
    'Dylan Phillips',    'Caleb King',
    -- Team 13
    'Reid Foster',       'Spencer Nguyen',
    -- Team 14
    'Tanner Wood',       'Austin Myers',
    -- Team 15
    'Logan Campbell',    'Cody Bell',
    -- Team 16
    'Hunter Jensen',     'Brett Harrison',
    -- Team 17
    'Kyle Murphy',       'Zac Coleman',
    -- Team 18
    'Wade Howard',       'Bryan Watkins',
    -- Team 19
    'Marcus Cook',       'Spencer Gray',
    -- Team 20
    'Craig Peterson',    'Kyle Bryant',
    -- Team 21
    'Jordan Simpson',    'Lance Patterson',
    -- Team 22
    'Nathan Bell',       'Derek Morgan',
    -- Team 23
    'Justin Ross',       'Tyler Barnes',
    -- Team 24
    'Corey Ward',        'Trent Kelly',
    -- Team 25
    'Drew Hamilton',     'Cole Andrews',
    -- Team 26
    'Reed Turner',       'Brent Wallace',
    -- Team 27
    'Carson Mitchell',   'Dillon Hayes',
    -- Team 28
    'Garrett Boyd',      'Travis Kim',
    -- Team 29
    'Peyton Murray',     'Graham Scott',
    -- Team 30
    'Kendall Cross',     'Dustin Burke',
    -- Team 31
    'Wesley Grant',      'Collin Carr',
    -- Team 32
    'Fletcher Webb',     'Sutton Price'
  ];

  -- DUPR ratings between 4.0 and 5.0 for each pair (main player)
  v_ratings numeric[] := ARRAY[
    4.8, 4.9,  -- Team 1
    4.7, 4.6,  -- Team 2
    5.0, 4.8,  -- Team 3
    4.5, 4.4,  -- Team 4
    4.9, 4.7,  -- Team 5
    4.3, 4.2,  -- Team 6
    4.6, 4.8,  -- Team 7
    4.1, 4.3,  -- Team 8
    4.7, 4.5,  -- Team 9
    4.9, 4.8,  -- Team 10
    4.4, 4.6,  -- Team 11
    5.0, 4.9,  -- Team 12
    4.2, 4.3,  -- Team 13
    4.5, 4.7,  -- Team 14
    4.8, 4.6,  -- Team 15
    4.3, 4.1,  -- Team 16
    4.7, 4.9,  -- Team 17
    4.2, 4.4,  -- Team 18
    4.6, 4.5,  -- Team 19
    5.0, 4.8,  -- Team 20
    4.3, 4.7,  -- Team 21
    4.9, 4.6,  -- Team 22
    4.4, 4.2,  -- Team 23
    4.8, 5.0,  -- Team 24
    4.1, 4.3,  -- Team 25
    4.7, 4.5,  -- Team 26
    4.6, 4.8,  -- Team 27
    4.9, 4.7,  -- Team 28
    4.3, 4.5,  -- Team 29
    4.8, 4.6,  -- Team 30
    5.0, 4.9,  -- Team 31
    4.4, 4.2   -- Team 32
  ];

BEGIN

  -- ── 1. Create 64 auth users + player profiles (d2 namespace) ───────────────
  FOR i IN 1..64 LOOP
    v_pid := ('d2000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid;

    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, email_change,
      email_change_token_new, recovery_token
    ) VALUES (
      v_pid,
      '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated',
      format('adv-dbl-%s@test.playoffe.com', lpad(i::text, 3, '0')),
      crypt('TestPass123!', gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"],"roles":["player"]}', '{}',
      now(), now(), '', '', '', ''
    ) ON CONFLICT (id) DO NOTHING;

    INSERT INTO players (id, email, username, full_name, gender, role)
    VALUES (
      v_pid,
      format('adv-dbl-%s@test.playoffe.com', lpad(i::text, 3, '0')),
      format('adv-dbl-%s', lpad(i::text, 3, '0')),
      v_names[i],
      'male',
      'player'
    ) ON CONFLICT (id) DO NOTHING;

    -- Add global_stats with DUPR rating
    INSERT INTO global_stats (player_id, current_rating, peak_rating, total_matches, wins, losses, win_rate)
    VALUES (v_pid, v_ratings[i], v_ratings[i], 0, 0, 0, 0)
    ON CONFLICT (player_id) DO UPDATE SET current_rating = EXCLUDED.current_rating;
  END LOOP;

  -- ── 2. Create 32 tournament entries (pairs from the 64 players) ─────────────
  FOR i IN 0..31 LOOP
    v_pid  := ('d2000000-0000-0000-0000-' || lpad(((i * 2) + 1)::text, 12, '0'))::uuid;
    v_pid2 := ('d2000000-0000-0000-0000-' || lpad(((i * 2) + 2)::text, 12, '0'))::uuid;

    INSERT INTO tournament_entries (
      tournament_id, category_id, player_id, partner_id, status, registered_at
    ) VALUES (
      v_tourn_id,
      v_cat_id,
      v_pid,
      v_pid2,
      'active',
      now() - ((31 - i) * interval '1 hour')
    ) ON CONFLICT DO NOTHING;
  END LOOP;

  RAISE NOTICE 'Seeded 32 doubles teams into Advance Men''s Doubles upto DUPR 5.0';
END $$;
