-- Add notification preferences to player profiles
alter table player_profiles
  add column if not exists notification_prefs jsonb not null default '{
    "match_reminders": true,
    "score_results": true,
    "tournament_updates": true,
    "partner_requests": true,
    "new_followers": true
  }'::jsonb;
