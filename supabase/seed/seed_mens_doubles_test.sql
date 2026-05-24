-- ============================================================
-- TEST DATA: Men's Doubles Open — 32 Teams, Group Stage + Knockouts
-- State: All group matches done, R16 done, QF done, SF in progress, Final TBD
-- ============================================================
-- Run in the Supabase SQL Editor (local dev only)
-- All IDs are in the d1/e1/a1/b1/c1/f1 UUID namespace so they can be cleaned up easily.
-- Owner login: owner@test.playoffe.com  password: TestPass123!

DO $$
DECLARE
  -- ── Fixed IDs ──────────────────────────────────────────────────────────────
  v_owner_id  constant uuid := 'f1000000-0000-0000-0000-000000000099';
  v_club_id   constant uuid := 'c1000000-0000-0000-0000-000000000001';
  v_tourn_id  constant uuid := 'a1000000-0000-0000-0000-000000000001';
  v_cat_id    constant uuid := 'b1000000-0000-0000-0000-000000000001';

  -- ── Runtime vars ───────────────────────────────────────────────────────────
  i           integer;
  g           integer; -- group index 0-7
  v_pid       uuid;
  v_pid2      uuid;
  v_eid       uuid;
  v_ea        uuid;
  v_eb        uuid;
  v_gname     text;

  -- ── Player name list (64 names, every pair = one doubles team) ─────────────
  v_names text[] := ARRAY[
    -- Group A ----------------------------------------------------------------
    'Jake Morrison',    'Tom Walsh',          -- Team 1 (Entry 1)
    'Chris Anderson',   'Ryan Mitchell',      -- Team 2 (Entry 2)
    'Ben Thompson',     'Alex Parker',        -- Team 3 (Entry 3)
    'Liam Johnson',     'Noah Wilson',        -- Team 4 (Entry 4)
    -- Group B ----------------------------------------------------------------
    'Ethan Davis',      'Mason Turner',       -- Team 5 (Entry 5)
    'Oliver Martin',    'Finn Edwards',       -- Team 6 (Entry 6)
    'Jack Robinson',    'Will Cooper',        -- Team 7 (Entry 7)
    'Aiden Clark',      'Luke Torres',        -- Team 8 (Entry 8)
    -- Group C ----------------------------------------------------------------
    'Daniel Lewis',     'James Allen',        -- Team 9 (Entry 9)
    'Matthew Walker',   'Tyler Hall',         -- Team 10 (Entry 10)
    'Nathan Young',     'Caleb Scott',        -- Team 11 (Entry 11)
    'Owen Green',       'Eli Baker',          -- Team 12 (Entry 12)
    -- Group D ----------------------------------------------------------------
    'Henry Carter',     'Samuel Adams',       -- Team 13 (Entry 13)
    'Sebastian Hill',   'Gabriel Campbell',   -- Team 14 (Entry 14)
    'Julian Rivera',    'Aaron Powell',       -- Team 15 (Entry 15)
    'Isaiah Brooks',    'Max Reed',           -- Team 16 (Entry 16)
    -- Group E ----------------------------------------------------------------
    'Elijah Morgan',    'Isaac Gray',         -- Team 17 (Entry 17)
    'Connor Price',     'Zachary Bennett',    -- Team 18 (Entry 18)
    'Evan Richardson',  'Austin Sanders',     -- Team 19 (Entry 19)
    'Colton Murphy',    'Brandon Diaz',       -- Team 20 (Entry 20)
    -- Group F ----------------------------------------------------------------
    'Gavin Foster',     'Bryce Alexander',    -- Team 21 (Entry 21)
    'Cody Stewart',     'Dylan Collins',      -- Team 22 (Entry 22)
    'Trevor Martinez',  'Brendan Wood',       -- Team 23 (Entry 23)
    'Bradley Simmons',  'Derek Cox',          -- Team 24 (Entry 24)
    -- Group G ----------------------------------------------------------------
    'Hunter Hughes',    'Shane Powell',       -- Team 25 (Entry 25)
    'Trent Kelly',      'Corey Ward',         -- Team 26 (Entry 26)
    'Tyler Barnes',     'Justin Ross',        -- Team 27 (Entry 27)
    'Spencer Gray',     'Marcus Cook',        -- Team 28 (Entry 28)
    -- Group H ----------------------------------------------------------------
    'Derek Morgan',     'Nathan Bell',        -- Team 29 (Entry 29)
    'Lance Patterson',  'Jordan Simpson',     -- Team 30 (Entry 30)
    'Kyle Bryant',      'Craig Peterson',     -- Team 31 (Entry 31)
    'Wade Howard',      'Bryan Watkins'       -- Team 32 (Entry 32)
  ];

  -- ── Knockout entry tracking ────────────────────────────────────────────────
  -- After group stage: pos 0 (1st) and pos 1 (2nd) advance from each group
  -- Group winners: E01, E05, E09, E13, E17, E21, E25, E29 (each group's 1st)
  -- Group runners-up: E02, E06, E10, E14, E18, E22, E26, E30 (each group's 2nd)

  -- R16 matchups (seeded crossover — A1 vs H2, H1 vs A2, B1 vs G2, G1 vs B2, ...)
  -- R16 winners: E01, E29, E05, E25, E09, E21, E13, E17
  e_r16_a1 uuid; e_r16_a2 uuid; e_r16_b1 uuid; e_r16_b2 uuid;
  e_r16_c1 uuid; e_r16_c2 uuid; e_r16_d1 uuid; e_r16_d2 uuid;

  -- QF matchups & winners
  e_qf_a1 uuid; e_qf_a2 uuid; e_qf_b1 uuid; e_qf_b2 uuid;
  -- QF winners: E01, E25, E21, E17
  e_qf_w1 uuid; e_qf_w2 uuid; e_qf_w3 uuid; e_qf_w4 uuid;

  -- SF: E01 vs E25 (in_progress), E21 vs E17 (in_progress)
  e_sf1a uuid; e_sf1b uuid; e_sf2a uuid; e_sf2b uuid;

  -- Today's date for scheduling
  v_today date := CURRENT_DATE;

BEGIN

  -- ══════════════════════════════════════════════════════════════════════════
  -- 1. OWNER USER
  -- ══════════════════════════════════════════════════════════════════════════
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, email_change,
    email_change_token_new, recovery_token
  ) VALUES (
    v_owner_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'owner@test.playoffe.com',
    crypt('TestPass123!', gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}', '{}',
    now(), now(), '', '', '', ''
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO players (id, email, username, full_name, gender, role)
  VALUES (v_owner_id, 'owner@test.playoffe.com', 'test-owner', 'Tournament Director', 'male', 'organizer')
  ON CONFLICT (id) DO NOTHING;


  -- ══════════════════════════════════════════════════════════════════════════
  -- 2. 64 PLAYER AUTH USERS + PLAYER ROWS
  -- ══════════════════════════════════════════════════════════════════════════
  FOR i IN 1..64 LOOP
    v_pid := ('d1000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid;

    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, email_change,
      email_change_token_new, recovery_token
    ) VALUES (
      v_pid,
      '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated',
      format('player%s@test.playoffe.com', lpad(i::text, 3, '0')),
      crypt('TestPass123!', gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}', '{}',
      now(), now(), '', '', '', ''
    ) ON CONFLICT (id) DO NOTHING;

    INSERT INTO players (id, email, username, full_name, gender, role)
    VALUES (
      v_pid,
      format('player%s@test.playoffe.com', lpad(i::text, 3, '0')),
      format('player-%s', lpad(i::text, 3, '0')),
      v_names[i],
      'male',
      'player'
    ) ON CONFLICT (id) DO NOTHING;
  END LOOP;


  -- ══════════════════════════════════════════════════════════════════════════
  -- 3. CLUB + TOURNAMENT + CATEGORY
  -- ══════════════════════════════════════════════════════════════════════════
  INSERT INTO clubs (id, name, slug, brand_primary_color, brand_secondary_color, city, country, subscription_tier)
  VALUES (v_club_id, 'Pickleball Australia', 'pickleball-australia', '#7c3aed', '#5b21b6', 'Sydney', 'Australia', 'pro')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO club_managers (club_id, player_id, role)
  VALUES (v_club_id, v_owner_id, 'owner')
  ON CONFLICT (club_id, player_id) DO NOTHING;

  INSERT INTO tournaments (id, club_id, name, venue, start_date, end_date, status, court_count, created_by)
  VALUES (
    v_tourn_id, v_club_id,
    'Men''s Doubles Open 2025',
    'National Pickleball Centre, Sydney',
    v_today, v_today,
    'in_progress', 4, v_owner_id
  ) ON CONFLICT (id) DO NOTHING;

  -- Category: group_stage_knockout, 8 groups of 4, top 2 advance
  INSERT INTO tournament_categories (id, tournament_id, name, type, play_format, draw_format, max_entries, status)
  VALUES (v_cat_id, v_tourn_id, 'Men''s Doubles Open', 'open', 'doubles', 'group_stage_knockout', 32, 'in_progress')
  ON CONFLICT (id) DO NOTHING;


  -- ══════════════════════════════════════════════════════════════════════════
  -- 4. 32 TOURNAMENT ENTRIES (one per team)
  -- ══════════════════════════════════════════════════════════════════════════
  FOR i IN 1..32 LOOP
    v_eid  := ('e1000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid;
    v_pid  := ('d1000000-0000-0000-0000-' || lpad((i * 2 - 1)::text, 12, '0'))::uuid; -- primary
    v_pid2 := ('d1000000-0000-0000-0000-' || lpad((i * 2)::text, 12, '0'))::uuid;     -- partner

    INSERT INTO tournament_entries (id, tournament_id, category_id, player_id, partner_id, status)
    VALUES (v_eid, v_tourn_id, v_cat_id, v_pid, v_pid2, 'active')
    ON CONFLICT (id) DO NOTHING;
  END LOOP;


  -- ══════════════════════════════════════════════════════════════════════════
  -- 5. GROUP STAGE MATCHES (8 groups × 4 teams = 48 matches, all completed)
  -- ══════════════════════════════════════════════════════════════════════════
  -- Round-robin within each group of 4 (positions 0,1,2,3 within group):
  --   Round 1: (pos0 v pos1), (pos2 v pos3)
  --   Round 2: (pos0 v pos2), (pos1 v pos3)
  --   Round 3: (pos0 v pos3), (pos1 v pos2)
  -- In ALL matches, entry_a wins (yielding standings: pos0=3W, pos1=2W, pos2=1W, pos3=0W)
  -- Advancing: pos0 (1st) and pos1 (2nd) from each group

  FOR g IN 0..7 LOOP
    v_gname := 'Group ' || chr(65 + g); -- 'Group A' .. 'Group H'

    -- Helper: entry at group position p (1-indexed in entry_ids)
    -- g=0 → entries 1-4, g=1 → entries 5-8, ..., g=7 → entries 29-32
    -- entry at position p: e1000000-0000-0000-0000-000000000001 + g*4 + p

    -- ── Round 1 ──────────────────────────────────────────────────────────────
    -- Match (pos0 vs pos1) — score: 11-8, 11-7
    v_ea := ('e1000000-0000-0000-0000-' || lpad((g*4 + 1)::text, 12, '0'))::uuid;
    v_eb := ('e1000000-0000-0000-0000-' || lpad((g*4 + 2)::text, 12, '0'))::uuid;
    INSERT INTO matches (category_id, tournament_id, round, round_name, group_name,
      entry_a_id, entry_b_id, winner_entry_id, status, sets, court,
      scheduled_time, started_at, completed_at)
    VALUES (v_cat_id, v_tourn_id, 1, 'Group Stage - Round 1', v_gname,
      v_ea, v_eb, v_ea, 'completed',
      '[{"set_number":1,"score_a":11,"score_b":8},{"set_number":2,"score_a":11,"score_b":7}]',
      (g % 4) + 1,
      v_today + '09:00'::time + (g/4 * interval '30 minutes'),
      v_today + '09:00'::time, v_today + '09:30'::time);

    -- Match (pos2 vs pos3) — score: 11-6, 11-9
    v_ea := ('e1000000-0000-0000-0000-' || lpad((g*4 + 3)::text, 12, '0'))::uuid;
    v_eb := ('e1000000-0000-0000-0000-' || lpad((g*4 + 4)::text, 12, '0'))::uuid;
    INSERT INTO matches (category_id, tournament_id, round, round_name, group_name,
      entry_a_id, entry_b_id, winner_entry_id, status, sets, court,
      scheduled_time, started_at, completed_at)
    VALUES (v_cat_id, v_tourn_id, 1, 'Group Stage - Round 1', v_gname,
      v_ea, v_eb, v_ea, 'completed',
      '[{"set_number":1,"score_a":11,"score_b":6},{"set_number":2,"score_a":11,"score_b":9}]',
      ((g + 2) % 4) + 1,
      v_today + '09:00'::time + (g/4 * interval '30 minutes'),
      v_today + '09:00'::time, v_today + '09:30'::time);

    -- ── Round 2 ──────────────────────────────────────────────────────────────
    -- Match (pos0 vs pos2) — score: 11-4, 11-5
    v_ea := ('e1000000-0000-0000-0000-' || lpad((g*4 + 1)::text, 12, '0'))::uuid;
    v_eb := ('e1000000-0000-0000-0000-' || lpad((g*4 + 3)::text, 12, '0'))::uuid;
    INSERT INTO matches (category_id, tournament_id, round, round_name, group_name,
      entry_a_id, entry_b_id, winner_entry_id, status, sets, court,
      scheduled_time, started_at, completed_at)
    VALUES (v_cat_id, v_tourn_id, 2, 'Group Stage - Round 2', v_gname,
      v_ea, v_eb, v_ea, 'completed',
      '[{"set_number":1,"score_a":11,"score_b":4},{"set_number":2,"score_a":11,"score_b":5}]',
      (g % 4) + 1,
      v_today + '10:00'::time + (g/4 * interval '30 minutes'),
      v_today + '10:00'::time, v_today + '10:30'::time);

    -- Match (pos1 vs pos3) — score: 11-7, 11-3
    v_ea := ('e1000000-0000-0000-0000-' || lpad((g*4 + 2)::text, 12, '0'))::uuid;
    v_eb := ('e1000000-0000-0000-0000-' || lpad((g*4 + 4)::text, 12, '0'))::uuid;
    INSERT INTO matches (category_id, tournament_id, round, round_name, group_name,
      entry_a_id, entry_b_id, winner_entry_id, status, sets, court,
      scheduled_time, started_at, completed_at)
    VALUES (v_cat_id, v_tourn_id, 2, 'Group Stage - Round 2', v_gname,
      v_ea, v_eb, v_ea, 'completed',
      '[{"set_number":1,"score_a":11,"score_b":7},{"set_number":2,"score_a":11,"score_b":3}]',
      ((g + 2) % 4) + 1,
      v_today + '10:00'::time + (g/4 * interval '30 minutes'),
      v_today + '10:00'::time, v_today + '10:30'::time);

    -- ── Round 3 ──────────────────────────────────────────────────────────────
    -- Match (pos0 vs pos3) — score: 11-3, 11-2
    v_ea := ('e1000000-0000-0000-0000-' || lpad((g*4 + 1)::text, 12, '0'))::uuid;
    v_eb := ('e1000000-0000-0000-0000-' || lpad((g*4 + 4)::text, 12, '0'))::uuid;
    INSERT INTO matches (category_id, tournament_id, round, round_name, group_name,
      entry_a_id, entry_b_id, winner_entry_id, status, sets, court,
      scheduled_time, started_at, completed_at)
    VALUES (v_cat_id, v_tourn_id, 3, 'Group Stage - Round 3', v_gname,
      v_ea, v_eb, v_ea, 'completed',
      '[{"set_number":1,"score_a":11,"score_b":3},{"set_number":2,"score_a":11,"score_b":2}]',
      (g % 4) + 1,
      v_today + '11:00'::time + (g/4 * interval '30 minutes'),
      v_today + '11:00'::time, v_today + '11:30'::time);

    -- Match (pos1 vs pos2) — score: 11-9, 8-11, 11-7 (3-setter for variety!)
    v_ea := ('e1000000-0000-0000-0000-' || lpad((g*4 + 2)::text, 12, '0'))::uuid;
    v_eb := ('e1000000-0000-0000-0000-' || lpad((g*4 + 3)::text, 12, '0'))::uuid;
    INSERT INTO matches (category_id, tournament_id, round, round_name, group_name,
      entry_a_id, entry_b_id, winner_entry_id, status, sets, court,
      scheduled_time, started_at, completed_at)
    VALUES (v_cat_id, v_tourn_id, 3, 'Group Stage - Round 3', v_gname,
      v_ea, v_eb, v_ea, 'completed',
      '[{"set_number":1,"score_a":11,"score_b":9},{"set_number":2,"score_a":8,"score_b":11},{"set_number":3,"score_a":11,"score_b":7}]',
      ((g + 2) % 4) + 1,
      v_today + '11:00'::time + (g/4 * interval '30 minutes'),
      v_today + '11:00'::time, v_today + '11:45'::time);

  END LOOP; -- end group stage


  -- ══════════════════════════════════════════════════════════════════════════
  -- 6. ROUND OF 16 (8 matches, all completed)
  -- ══════════════════════════════════════════════════════════════════════════
  -- Seeded crossover bracket:
  --   Grp A 1st (E01) vs Grp H 2nd (E30) → E01 wins
  --   Grp H 1st (E29) vs Grp A 2nd (E02) → E29 wins
  --   Grp B 1st (E05) vs Grp G 2nd (E26) → E05 wins
  --   Grp G 1st (E25) vs Grp B 2nd (E06) → E25 wins
  --   Grp C 1st (E09) vs Grp F 2nd (E22) → E09 wins
  --   Grp F 1st (E21) vs Grp C 2nd (E10) → E21 wins
  --   Grp D 1st (E13) vs Grp E 2nd (E18) → E13 wins
  --   Grp E 1st (E17) vs Grp D 2nd (E14) → E17 wins

  -- R16 Match 1: E01 vs E30 → E01 wins
  e_r16_a1 := 'e1000000-0000-0000-0000-000000000001'::uuid; -- E01 (winner)
  INSERT INTO matches (category_id, tournament_id, round, round_name,
    entry_a_id, entry_b_id, winner_entry_id, status, sets, court,
    scheduled_time, started_at, completed_at)
  VALUES (v_cat_id, v_tourn_id, 4, 'Round of 16',
    'e1000000-0000-0000-0000-000000000001'::uuid,
    'e1000000-0000-0000-0000-000000000030'::uuid,
    'e1000000-0000-0000-0000-000000000001'::uuid,
    'completed',
    '[{"set_number":1,"score_a":11,"score_b":6},{"set_number":2,"score_a":11,"score_b":8}]',
    1, v_today + '12:00'::time, v_today + '12:00'::time, v_today + '12:30'::time);

  -- R16 Match 2: E29 vs E02 → E29 wins
  e_r16_a2 := 'e1000000-0000-0000-0000-000000000029'::uuid; -- E29 (winner)
  INSERT INTO matches (category_id, tournament_id, round, round_name,
    entry_a_id, entry_b_id, winner_entry_id, status, sets, court,
    scheduled_time, started_at, completed_at)
  VALUES (v_cat_id, v_tourn_id, 4, 'Round of 16',
    'e1000000-0000-0000-0000-000000000029'::uuid,
    'e1000000-0000-0000-0000-000000000002'::uuid,
    'e1000000-0000-0000-0000-000000000029'::uuid,
    'completed',
    '[{"set_number":1,"score_a":11,"score_b":9},{"set_number":2,"score_a":9,"score_b":11},{"set_number":3,"score_a":11,"score_b":7}]',
    2, v_today + '12:00'::time, v_today + '12:00'::time, v_today + '12:45'::time);

  -- R16 Match 3: E05 vs E26 → E05 wins
  e_r16_b1 := 'e1000000-0000-0000-0000-000000000005'::uuid; -- E05 (winner)
  INSERT INTO matches (category_id, tournament_id, round, round_name,
    entry_a_id, entry_b_id, winner_entry_id, status, sets, court,
    scheduled_time, started_at, completed_at)
  VALUES (v_cat_id, v_tourn_id, 4, 'Round of 16',
    'e1000000-0000-0000-0000-000000000005'::uuid,
    'e1000000-0000-0000-0000-000000000026'::uuid,
    'e1000000-0000-0000-0000-000000000005'::uuid,
    'completed',
    '[{"set_number":1,"score_a":11,"score_b":7},{"set_number":2,"score_a":11,"score_b":5}]',
    3, v_today + '12:00'::time, v_today + '12:00'::time, v_today + '12:30'::time);

  -- R16 Match 4: E25 vs E06 → E25 wins
  e_r16_b2 := 'e1000000-0000-0000-0000-000000000025'::uuid; -- E25 (winner)
  INSERT INTO matches (category_id, tournament_id, round, round_name,
    entry_a_id, entry_b_id, winner_entry_id, status, sets, court,
    scheduled_time, started_at, completed_at)
  VALUES (v_cat_id, v_tourn_id, 4, 'Round of 16',
    'e1000000-0000-0000-0000-000000000025'::uuid,
    'e1000000-0000-0000-0000-000000000006'::uuid,
    'e1000000-0000-0000-0000-000000000025'::uuid,
    'completed',
    '[{"set_number":1,"score_a":11,"score_b":8},{"set_number":2,"score_a":11,"score_b":9}]',
    4, v_today + '12:00'::time, v_today + '12:00'::time, v_today + '12:30'::time);

  -- R16 Match 5: E09 vs E22 → E09 wins
  e_r16_c1 := 'e1000000-0000-0000-0000-000000000009'::uuid; -- E09 (winner)
  INSERT INTO matches (category_id, tournament_id, round, round_name,
    entry_a_id, entry_b_id, winner_entry_id, status, sets, court,
    scheduled_time, started_at, completed_at)
  VALUES (v_cat_id, v_tourn_id, 4, 'Round of 16',
    'e1000000-0000-0000-0000-000000000009'::uuid,
    'e1000000-0000-0000-0000-000000000022'::uuid,
    'e1000000-0000-0000-0000-000000000009'::uuid,
    'completed',
    '[{"set_number":1,"score_a":11,"score_b":5},{"set_number":2,"score_a":11,"score_b":7}]',
    1, v_today + '12:30'::time, v_today + '12:30'::time, v_today + '13:00'::time);

  -- R16 Match 6: E21 vs E10 → E21 wins
  e_r16_c2 := 'e1000000-0000-0000-0000-000000000021'::uuid; -- E21 (winner)
  INSERT INTO matches (category_id, tournament_id, round, round_name,
    entry_a_id, entry_b_id, winner_entry_id, status, sets, court,
    scheduled_time, started_at, completed_at)
  VALUES (v_cat_id, v_tourn_id, 4, 'Round of 16',
    'e1000000-0000-0000-0000-000000000021'::uuid,
    'e1000000-0000-0000-0000-000000000010'::uuid,
    'e1000000-0000-0000-0000-000000000021'::uuid,
    'completed',
    '[{"set_number":1,"score_a":11,"score_b":9},{"set_number":2,"score_a":7,"score_b":11},{"set_number":3,"score_a":11,"score_b":8}]',
    2, v_today + '12:30'::time, v_today + '12:30'::time, v_today + '13:15'::time);

  -- R16 Match 7: E13 vs E18 → E13 wins
  e_r16_d1 := 'e1000000-0000-0000-0000-000000000013'::uuid; -- E13 (winner)
  INSERT INTO matches (category_id, tournament_id, round, round_name,
    entry_a_id, entry_b_id, winner_entry_id, status, sets, court,
    scheduled_time, started_at, completed_at)
  VALUES (v_cat_id, v_tourn_id, 4, 'Round of 16',
    'e1000000-0000-0000-0000-000000000013'::uuid,
    'e1000000-0000-0000-0000-000000000018'::uuid,
    'e1000000-0000-0000-0000-000000000013'::uuid,
    'completed',
    '[{"set_number":1,"score_a":11,"score_b":6},{"set_number":2,"score_a":11,"score_b":4}]',
    3, v_today + '12:30'::time, v_today + '12:30'::time, v_today + '13:00'::time);

  -- R16 Match 8: E17 vs E14 → E17 wins
  e_r16_d2 := 'e1000000-0000-0000-0000-000000000017'::uuid; -- E17 (winner)
  INSERT INTO matches (category_id, tournament_id, round, round_name,
    entry_a_id, entry_b_id, winner_entry_id, status, sets, court,
    scheduled_time, started_at, completed_at)
  VALUES (v_cat_id, v_tourn_id, 4, 'Round of 16',
    'e1000000-0000-0000-0000-000000000017'::uuid,
    'e1000000-0000-0000-0000-000000000014'::uuid,
    'e1000000-0000-0000-0000-000000000017'::uuid,
    'completed',
    '[{"set_number":1,"score_a":11,"score_b":8},{"set_number":2,"score_a":11,"score_b":7}]',
    4, v_today + '12:30'::time, v_today + '12:30'::time, v_today + '13:00'::time);


  -- ══════════════════════════════════════════════════════════════════════════
  -- 7. QUARTER-FINALS (4 matches, all completed)
  -- ══════════════════════════════════════════════════════════════════════════
  -- QF1: E01 vs E29 → E01 wins
  -- QF2: E05 vs E25 → E25 wins (UPSET)
  -- QF3: E09 vs E21 → E21 wins (UPSET)
  -- QF4: E13 vs E17 → E17 wins (UPSET)

  e_qf_w1 := 'e1000000-0000-0000-0000-000000000001'::uuid; -- E01
  e_qf_w2 := 'e1000000-0000-0000-0000-000000000025'::uuid; -- E25
  e_qf_w3 := 'e1000000-0000-0000-0000-000000000021'::uuid; -- E21
  e_qf_w4 := 'e1000000-0000-0000-0000-000000000017'::uuid; -- E17

  -- QF1: E01 vs E29
  INSERT INTO matches (category_id, tournament_id, round, round_name,
    entry_a_id, entry_b_id, winner_entry_id, status, sets, court,
    scheduled_time, started_at, completed_at)
  VALUES (v_cat_id, v_tourn_id, 5, 'Quarter-Final',
    'e1000000-0000-0000-0000-000000000001'::uuid,
    'e1000000-0000-0000-0000-000000000029'::uuid,
    'e1000000-0000-0000-0000-000000000001'::uuid,
    'completed',
    '[{"set_number":1,"score_a":11,"score_b":7},{"set_number":2,"score_a":11,"score_b":9}]',
    1, v_today + '13:30'::time, v_today + '13:30'::time, v_today + '14:00'::time);

  -- QF2: E05 vs E25 (E25 wins — upset!)
  INSERT INTO matches (category_id, tournament_id, round, round_name,
    entry_a_id, entry_b_id, winner_entry_id, status, sets, court,
    scheduled_time, started_at, completed_at)
  VALUES (v_cat_id, v_tourn_id, 5, 'Quarter-Final',
    'e1000000-0000-0000-0000-000000000005'::uuid,
    'e1000000-0000-0000-0000-000000000025'::uuid,
    'e1000000-0000-0000-0000-000000000025'::uuid,
    'completed',
    '[{"set_number":1,"score_a":9,"score_b":11},{"set_number":2,"score_a":11,"score_b":9},{"set_number":3,"score_a":8,"score_b":11}]',
    2, v_today + '13:30'::time, v_today + '13:30'::time, v_today + '14:15'::time);

  -- QF3: E09 vs E21 (E21 wins — upset!)
  INSERT INTO matches (category_id, tournament_id, round, round_name,
    entry_a_id, entry_b_id, winner_entry_id, status, sets, court,
    scheduled_time, started_at, completed_at)
  VALUES (v_cat_id, v_tourn_id, 5, 'Quarter-Final',
    'e1000000-0000-0000-0000-000000000009'::uuid,
    'e1000000-0000-0000-0000-000000000021'::uuid,
    'e1000000-0000-0000-0000-000000000021'::uuid,
    'completed',
    '[{"set_number":1,"score_a":8,"score_b":11},{"set_number":2,"score_a":11,"score_b":8},{"set_number":3,"score_a":9,"score_b":11}]',
    3, v_today + '13:30'::time, v_today + '13:30'::time, v_today + '14:15'::time);

  -- QF4: E13 vs E17 (E17 wins — upset!)
  INSERT INTO matches (category_id, tournament_id, round, round_name,
    entry_a_id, entry_b_id, winner_entry_id, status, sets, court,
    scheduled_time, started_at, completed_at)
  VALUES (v_cat_id, v_tourn_id, 5, 'Quarter-Final',
    'e1000000-0000-0000-0000-000000000013'::uuid,
    'e1000000-0000-0000-0000-000000000017'::uuid,
    'e1000000-0000-0000-0000-000000000017'::uuid,
    'completed',
    '[{"set_number":1,"score_a":7,"score_b":11},{"set_number":2,"score_a":11,"score_b":9},{"set_number":3,"score_a":9,"score_b":11}]',
    4, v_today + '13:30'::time, v_today + '13:30'::time, v_today + '14:15'::time);


  -- ══════════════════════════════════════════════════════════════════════════
  -- 8. SEMI-FINALS (2 matches — IN PROGRESS with live scores)
  -- ══════════════════════════════════════════════════════════════════════════
  -- SF1: E01 (Jake Morrison / Tom Walsh) vs E25 (Hunter Hughes / Shane Powell)
  --      Live: Set 1 complete 11-7, Set 2 in progress 8-4
  e_sf1a := 'e1000000-0000-0000-0000-000000000001'::uuid; -- E01
  e_sf1b := 'e1000000-0000-0000-0000-000000000025'::uuid; -- E25

  INSERT INTO matches (category_id, tournament_id, round, round_name,
    entry_a_id, entry_b_id, status, sets, court,
    scheduled_time, started_at)
  VALUES (v_cat_id, v_tourn_id, 6, 'Semi-Final',
    e_sf1a, e_sf1b, 'in_progress',
    '[{"set_number":1,"score_a":11,"score_b":7},{"set_number":2,"score_a":8,"score_b":4}]',
    1, v_today + '15:00'::time, v_today + '15:00'::time);

  -- SF2: E21 (Gavin Foster / Bryce Alexander) vs E17 (Elijah Morgan / Isaac Gray)
  --      Live: Set 1 complete 9-11, Set 2 in progress 7-5
  e_sf2a := 'e1000000-0000-0000-0000-000000000021'::uuid; -- E21
  e_sf2b := 'e1000000-0000-0000-0000-000000000017'::uuid; -- E17

  INSERT INTO matches (category_id, tournament_id, round, round_name,
    entry_a_id, entry_b_id, status, sets, court,
    scheduled_time, started_at)
  VALUES (v_cat_id, v_tourn_id, 6, 'Semi-Final',
    e_sf2a, e_sf2b, 'in_progress',
    '[{"set_number":1,"score_a":9,"score_b":11},{"set_number":2,"score_a":7,"score_b":5}]',
    2, v_today + '15:00'::time, v_today + '15:00'::time);


  -- ══════════════════════════════════════════════════════════════════════════
  -- 9. FINAL + 3RD PLACE MATCH (scheduled, entries TBD)
  -- ══════════════════════════════════════════════════════════════════════════
  INSERT INTO matches (category_id, tournament_id, round, round_name,
    entry_a_id, entry_b_id, status, sets, court, scheduled_time)
  VALUES (v_cat_id, v_tourn_id, 7, 'Final',
    null, null, 'scheduled', '[]', 1, v_today + '17:00'::time);

  INSERT INTO matches (category_id, tournament_id, round, round_name,
    entry_a_id, entry_b_id, status, sets, court, scheduled_time)
  VALUES (v_cat_id, v_tourn_id, 7, '3rd Place',
    null, null, 'scheduled', '[]', 2, v_today + '17:00'::time);


  RAISE NOTICE '✅ Seed complete! Tournament ID: %', v_tourn_id;
  RAISE NOTICE '   Display code will be set by trigger on the tournament row.';
  RAISE NOTICE '   Go to: /display/<display_code> to see the TV screen.';
  RAISE NOTICE '   Organiser login: owner@test.playoffe.com / TestPass123!';
  RAISE NOTICE '   Tournament slug will be auto-generated from the name.';

END $$;
