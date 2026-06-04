-- Feature flags for AI Schedule Assistant and Rankings visibility.

INSERT INTO feature_flags (feature_module, is_enabled) VALUES
  ('ai_schedule_assistant', true),   -- AI scheduling chat for admins; super admins always see it
  ('rankings',              true)    -- Rankings nav link and page visibility
ON CONFLICT (feature_module) DO NOTHING;
