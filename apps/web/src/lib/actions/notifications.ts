'use server';

import { revalidatePath } from 'next/cache';
import { createClient, createAdminClient } from '@/lib/supabase/server';

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
    const { data: { user } } = await supabase.auth.getUser();
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
    const { data: { user } } = await supabase.auth.getUser();
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
    const { data: { user } } = await supabase.auth.getUser();
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
    await admin.from('notifications').insert({
      player_id: playerId,
      type,
      title,
      body: body ?? null,
      link: link ?? null,
    });
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
    await admin.from('notifications').insert(
      playerIds.map((player_id) => ({
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

export async function getNotificationPrefsAction(): Promise<NotificationPrefs> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
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
  const { data: { user } } = await supabase.auth.getUser();
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
