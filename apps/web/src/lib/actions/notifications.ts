'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient, createClient, getCurrentUser } from '@/lib/supabase/server';
import { sendPushToPlayer } from '@/lib/actions/push';
import type { NotificationPrefs } from '@/lib/notification-types';
import { DEFAULT_NOTIFICATION_PREFS } from '@/lib/notification-types';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

// ── Read actions (user-scoped) ────────────────────────────────────────────────

export async function getNotificationsAction(): Promise<{
  notifications?: Notification[];
  unreadCount?: number;
  error?: string;
}> {
  try {
    const supabase = await createClient();
    const user = await getCurrentUser();
    if (!user) return { notifications: [], unreadCount: 0 };

    const { data, error } = await supabase
      .from('notifications')
      .select('id, type, title, body, link, is_read, created_at')
      .eq('player_id', user.id)
      .order('created_at', { ascending: false })
      .limit(30);

    if (error) return { error: error.message };

    const rows = (data ?? []) as Notification[];
    const unreadCount = rows.filter((n) => !n.is_read).length;
    return { notifications: rows, unreadCount };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function markNotificationReadAction(id: string) {
  try {
    const supabase = await createClient();
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };

    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id)
      .eq('player_id', user.id);

    revalidatePath('/', 'layout');
    return { success: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function markAllNotificationsReadAction() {
  try {
    const supabase = await createClient();
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };

    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('player_id', user.id)
      .eq('is_read', false);

    revalidatePath('/', 'layout');
    return { success: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

// ── Notification type → preference key mapping ────────────────────────────────
// Any type not listed here bypasses the pref check (always delivered).
const TYPE_TO_PREF: Record<string, keyof NotificationPrefs> = {
  match_result:      'score_results',
  score_reported:    'score_results',
  match_reminder:    'match_reminders',
  tournament_invite: 'tournament_updates',
  tournament_update: 'tournament_updates',
  partner_invite:    'partner_requests',
  partner_request:   'partner_requests',
  team_invite:       'partner_requests', // reuses the same opt-out pref as doubles partner invites
  new_follower:      'new_followers',
};

async function getPrefsForPlayers(
  admin: ReturnType<typeof createAdminClient>,
  playerIds: string[],
): Promise<Map<string, NotificationPrefs>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (admin.from('player_profiles') as any)
    .select('player_id, notification_prefs')
    .in('player_id', playerIds);

  const map = new Map<string, NotificationPrefs>();
  for (const row of (data ?? []) as Array<{ player_id: string; notification_prefs: unknown }>) {
    map.set(
      row.player_id,
      { ...DEFAULT_NOTIFICATION_PREFS, ...(row.notification_prefs as Partial<NotificationPrefs>) },
    );
  }
  return map;
}

// ── Write helpers (called internally from other actions via admin client) ─────

export async function createNotificationForPlayer(
  playerId: string,
  type: string,
  title: string,
  body?: string,
  link?: string,
) {
  try {
    const admin = createAdminClient();

    // Respect opt-out preferences
    const prefKey = TYPE_TO_PREF[type];
    if (prefKey) {
      const prefsMap = await getPrefsForPlayers(admin, [playerId]);
      const prefs = prefsMap.get(playerId) ?? DEFAULT_NOTIFICATION_PREFS;
      if (!prefs[prefKey]) return; // player opted out
    }

    await admin.from('notifications').insert({
      player_id: playerId,
      type,
      title,
      body: body ?? null,
      link: link ?? null,
    });

    // Fire-and-forget web push (no-ops if VAPID not configured)
    sendPushToPlayer(playerId, title, body ?? '', link ?? '/').catch(() => {});
  } catch {
    // Fire-and-forget — never block the calling action
  }
}

export async function createNotificationsForPlayers(
  playerIds: string[],
  type: string,
  title: string,
  body?: string,
  link?: string,
) {
  if (playerIds.length === 0) return;
  try {
    const admin = createAdminClient();

    // Respect opt-out preferences — filter to players who want this type
    const prefKey = TYPE_TO_PREF[type];
    let eligibleIds = playerIds;
    if (prefKey) {
      const prefsMap = await getPrefsForPlayers(admin, playerIds);
      eligibleIds = playerIds.filter((id) => {
        const prefs = prefsMap.get(id) ?? DEFAULT_NOTIFICATION_PREFS;
        return prefs[prefKey];
      });
    }

    if (eligibleIds.length === 0) return;

    await admin.from('notifications').insert(
      eligibleIds.map((player_id) => ({
        player_id,
        type,
        title,
        body: body ?? null,
        link: link ?? null,
      })),
    );
  } catch {
    // Fire-and-forget
  }
}

// ── Notification preferences ──────────────────────────────────────────────────

export async function getNotificationPrefsAction(): Promise<NotificationPrefs> {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return DEFAULT_NOTIFICATION_PREFS;

  // Use admin to bypass RLS and select the JSONB column (may not be in generated types yet)
  const admin = createAdminClient();
  const { data } = await admin
    .from('player_profiles')
    .select('notification_prefs')
    .eq('player_id', user.id)
    .maybeSingle();

  const prefs = (data as Record<string, unknown> | null)?.notification_prefs;
  if (!prefs) return DEFAULT_NOTIFICATION_PREFS;
  return { ...DEFAULT_NOTIFICATION_PREFS, ...(prefs as Partial<NotificationPrefs>) };
}

export async function saveNotificationPrefsAction(prefs: NotificationPrefs) {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return { error: 'Not authenticated' };

  const admin = createAdminClient();
  const { error } = await admin
    .from('player_profiles')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .upsert({ player_id: user.id, notification_prefs: prefs } as any, { onConflict: 'player_id' });

  if (error) return { error: error.message };
  revalidatePath('/settings/notifications');
  return { success: true };
}
