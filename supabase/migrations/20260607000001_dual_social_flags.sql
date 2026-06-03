-- Split single 'social_media' feature flag into two role-specific flags.
--
-- social_media_organiser: club owners/admins can post draws, schedules,
--   category/tournament winners to their club's social pages.
-- social_media_player: players can auto-post match wins and achievements.
--
-- Initial release: organiser enabled, player disabled.

-- Remove the old monolithic flag
DELETE FROM feature_flags WHERE feature_module = 'social_media';

-- Insert the two specific flags
INSERT INTO feature_flags (feature_module, is_enabled) VALUES
  ('social_media_organiser', true),   -- enabled for club owners/admins from launch
  ('social_media_player',    false)   -- disabled for players in initial release
ON CONFLICT (feature_module) DO NOTHING;

-- ── Extend social_post_log for organiser posts ──────────────────────────────
-- Add club_id so organiser draw/schedule/podium posts can be attributed to a club.
ALTER TABLE social_post_log
  ADD COLUMN IF NOT EXISTS club_id UUID REFERENCES clubs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS social_post_log_club_id_idx
  ON social_post_log (club_id)
  WHERE club_id IS NOT NULL;

-- Extend the trigger_type check to include organiser-initiated post types.
ALTER TABLE social_post_log
  DROP CONSTRAINT IF EXISTS social_post_log_trigger_type_check;

ALTER TABLE social_post_log
  ADD CONSTRAINT social_post_log_trigger_type_check
    CHECK (trigger_type IN (
      'match_win',
      'category_complete',
      'tournament_complete',
      'podium',
      'wrap_up',
      'draw_published',      -- organiser shares the draw after generation
      'schedule_released'    -- organiser shares the match schedule
    ));
