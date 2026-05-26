// Shared notification types — no 'use server' directive so these can be
// imported by both server actions and client components.

export interface NotificationPrefs {
  match_reminders: boolean;
  score_results: boolean;
  tournament_updates: boolean;
  partner_requests: boolean;
  new_followers: boolean;
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  match_reminders: true,
  score_results: true,
  tournament_updates: true,
  partner_requests: true,
  new_followers: true,
};
