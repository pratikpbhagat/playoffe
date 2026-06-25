-- Seed tournament_entries for "Blue Bird Open July 2026" across all 4 categories,
-- respecting each category's max_entries (16) and singles/doubles format.
-- Player allocation (male pool ranked by id, non-male pool ranked by id):
--   Singles (16 players):           male rn 1-16
--   Men's Doubles (16 teams):       male rn 17-48  (paired sequentially)
--   Beginner Mixed (16 teams):      2 real mixed pairs (nonmale rn1-2 + male rn49-50)
--                                   + 14 male/male placeholder pairs (male rn51-78)
--   Open Mixed (16 teams):          2 real mixed pairs (nonmale rn3-4 + male rn79-80)
--                                   + 14 male/male placeholder pairs (male rn81-108)

DO $$
DECLARE
  v_tournament_id uuid := '34883698-1b4a-4857-bdd7-007423776aad';
  v_singles_cat    uuid := '62fccbe4-191a-495d-b021-ba655ce47362'; -- Intermediate Men's Singles upto 4.2
  v_mens_doubles   uuid := 'a7001c04-ba3e-4f3c-aeea-2f3ad27c52b9'; -- Intermediate Men's Doubles upto 4.2
  v_beginner_mixed uuid := 'fadcb9b7-19ae-4e47-ab6b-0679055f238a'; -- Beginner Mixed Doubles
  v_open_mixed     uuid := 'db9fad7e-09bf-4006-ad42-2a44f5a57b20'; -- Open Mixed Doubles
BEGIN

WITH male_pool AS (
  SELECT id, row_number() OVER (ORDER BY id) AS rn FROM players WHERE gender = 'male'
),
nonmale_pool AS (
  SELECT id, row_number() OVER (ORDER BY id) AS rn FROM players WHERE gender != 'male'
)

-- ── Singles: 16 individual entries ─────────────────────────────────────────
INSERT INTO tournament_entries (tournament_id, category_id, player_id, status)
SELECT v_tournament_id, v_singles_cat, id, 'active'::entry_status_enum
FROM male_pool WHERE rn BETWEEN 1 AND 16;

WITH male_pool AS (
  SELECT id, row_number() OVER (ORDER BY id) AS rn FROM players WHERE gender = 'male'
),
md_pairs AS (
  SELECT a.id AS p1, b.id AS p2
  FROM male_pool a JOIN male_pool b ON b.rn = a.rn + 1
  WHERE a.rn BETWEEN 17 AND 47 AND a.rn % 2 = 1
)
-- ── Men's Doubles: 16 teams from male rn 17-48 ─────────────────────────────
INSERT INTO tournament_entries (tournament_id, category_id, player_id, partner_id, status)
SELECT v_tournament_id, v_mens_doubles, p1, p2, 'active'::entry_status_enum FROM md_pairs;

WITH male_pool AS (
  SELECT id, row_number() OVER (ORDER BY id) AS rn FROM players WHERE gender = 'male'
),
nonmale_pool AS (
  SELECT id, row_number() OVER (ORDER BY id) AS rn FROM players WHERE gender != 'male'
),
real_pairs AS (
  SELECT n.id AS p1, m.id AS p2
  FROM nonmale_pool n JOIN male_pool m ON m.rn = n.rn + 48
  WHERE n.rn BETWEEN 1 AND 2
),
placeholder_pairs AS (
  SELECT a.id AS p1, b.id AS p2
  FROM male_pool a JOIN male_pool b ON b.rn = a.rn + 1
  WHERE a.rn BETWEEN 51 AND 77 AND a.rn % 2 = 1
)
-- ── Beginner Mixed Doubles: 2 real mixed pairs + 14 placeholder pairs ──────
INSERT INTO tournament_entries (tournament_id, category_id, player_id, partner_id, status)
SELECT v_tournament_id, v_beginner_mixed, p1, p2, 'active'::entry_status_enum FROM real_pairs
UNION ALL
SELECT v_tournament_id, v_beginner_mixed, p1, p2, 'active'::entry_status_enum FROM placeholder_pairs;

WITH male_pool AS (
  SELECT id, row_number() OVER (ORDER BY id) AS rn FROM players WHERE gender = 'male'
),
nonmale_pool AS (
  SELECT id, row_number() OVER (ORDER BY id) AS rn FROM players WHERE gender != 'male'
),
real_pairs AS (
  SELECT n.id AS p1, m.id AS p2
  FROM nonmale_pool n JOIN male_pool m ON m.rn = n.rn + 76
  WHERE n.rn BETWEEN 3 AND 4
),
placeholder_pairs AS (
  SELECT a.id AS p1, b.id AS p2
  FROM male_pool a JOIN male_pool b ON b.rn = a.rn + 1
  WHERE a.rn BETWEEN 81 AND 107 AND a.rn % 2 = 1
)
-- ── Open Mixed Doubles: 2 real mixed pairs + 14 placeholder pairs ─────────
INSERT INTO tournament_entries (tournament_id, category_id, player_id, partner_id, status)
SELECT v_tournament_id, v_open_mixed, p1, p2, 'active'::entry_status_enum FROM real_pairs
UNION ALL
SELECT v_tournament_id, v_open_mixed, p1, p2, 'active'::entry_status_enum FROM placeholder_pairs;

END $$;
