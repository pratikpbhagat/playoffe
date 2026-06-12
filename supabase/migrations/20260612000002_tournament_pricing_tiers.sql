-- Pay-as-you-go per-tournament event fees, based on total player count
-- (counts every player across all categories/entries in a tournament,
-- so doubles/team entries count each member individually).

CREATE TABLE tournament_pricing_tiers (
  id                integer PRIMARY KEY,
  min_players       integer NOT NULL,
  max_players       integer,            -- NULL = unlimited (top band)
  fee_paise         integer NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tournament_pricing_tiers_range_chk CHECK (max_players IS NULL OR max_players >= min_players)
);

ALTER TABLE tournament_pricing_tiers ENABLE ROW LEVEL SECURITY;

-- Public read, same as plan_limits — used on the pricing page.
CREATE POLICY "tournament_pricing_tiers_public_read" ON tournament_pricing_tiers
  FOR SELECT USING (true);

INSERT INTO tournament_pricing_tiers (id, min_players, max_players, fee_paise) VALUES
  (1, 0,   16,   0),
  (2, 17,  32,   29900),
  (3, 33,  64,   59900),
  (4, 65,  128,  99900),
  (5, 129, NULL, 149900)
ON CONFLICT (id) DO NOTHING;
