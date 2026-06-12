-- Plan limits & pricing for each subscription tier.
-- Prices are stored in paise (INR) to avoid floating point rounding.

CREATE TABLE plan_limits (
  tier                          subscription_tier_enum PRIMARY KEY,
  max_active_tournaments        integer,                  -- NULL = unlimited
  max_participants_per_tournament integer,                -- NULL = unlimited
  max_categories_per_tournament integer,                  -- NULL = unlimited
  max_club_managers             integer,                  -- NULL = unlimited
  feature_live_scoring          boolean NOT NULL DEFAULT false,
  feature_referee_app           boolean NOT NULL DEFAULT false,
  feature_custom_branding       boolean NOT NULL DEFAULT false,
  feature_advanced_analytics    boolean NOT NULL DEFAULT false,
  monthly_price_paise           integer NOT NULL DEFAULT 0,
  annual_price_paise            integer NOT NULL DEFAULT 0,
  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE plan_limits ENABLE ROW LEVEL SECURITY;

-- Plan limits/pricing are public information (used on the pricing page).
CREATE POLICY "plan_limits_public_read" ON plan_limits
  FOR SELECT USING (true);

INSERT INTO plan_limits (
  tier, max_active_tournaments, max_participants_per_tournament, max_categories_per_tournament,
  max_club_managers, feature_live_scoring, feature_referee_app, feature_custom_branding,
  feature_advanced_analytics, monthly_price_paise, annual_price_paise
) VALUES
  ('free',       1, 32,  2,    1,    false, false, false, false,      0,       0),
  ('starter',    3, 64,  5,    2,    true,  true,  false, false,  29900,  299900),
  ('pro',     NULL, 256, NULL, 5,    true,  true,  true,  true,   79900,  799900),
  ('enterprise', NULL, NULL, NULL, NULL, true,  true,  true,  true, 249900, 2499900)
ON CONFLICT (tier) DO NOTHING;
