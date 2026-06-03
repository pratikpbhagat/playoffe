'use server';

import { revalidatePath } from 'next/cache';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import type {
  SocialConnectionPublic,
  SocialPostPrefs,
  OAuthPlatform,
} from '@/lib/social-types';
import { DEFAULT_SOCIAL_POST_PREFS } from '@/lib/social-types';
import { getPostQueue, enqueueDrawPublished, enqueueScheduleReleased } from '@/lib/social-queue';

// ── Shared post log row type ──────────────────────────────────────────────────

export interface PostLogRow {
  id: string;
  platform: string;
  trigger_type: string;
  status: string;
  graphic_url: string | null;
  caption: string | null;
  caption_style: string | null;
  platform_post_id: string | null; // also used as WhatsApp share URL
  error_message: string | null;
  queued_at: string;
  posted_at: string | null;
}

// ── Club connection type (safe for client — no tokens) ────────────────────────

export interface ClubConnectionPublic {
  platform: OAuthPlatform;
  platform_username: string | null;
  platform_display_name: string | null;
  is_active: boolean;
  connected_at: string;
}

// ── Read ──────────────────────────────────────────────────────────────────────

/** Returns active OAuth connections for the current player (no tokens). */
export async function getSocialConnectionsAction(): Promise<SocialConnectionPublic[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('social_connections')
    .select('platform, platform_username, platform_display_name, is_active, connected_at')
    .eq('player_id', user.id)
    .eq('is_active', true)
    .order('connected_at', { ascending: true });

  return (data ?? []) as SocialConnectionPublic[];
}

/** Returns social posting preferences for the current player. */
export async function getSocialPostPrefsAction(): Promise<SocialPostPrefs> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return DEFAULT_SOCIAL_POST_PREFS;

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (admin.from('player_profiles') as any)
    .select('social_post_prefs')
    .eq('player_id', user.id)
    .maybeSingle();

  const prefs = (data as Record<string, unknown> | null)?.social_post_prefs;
  if (!prefs) return DEFAULT_SOCIAL_POST_PREFS;
  return {
    ...DEFAULT_SOCIAL_POST_PREFS,
    ...(prefs as Partial<SocialPostPrefs>),
  };
}

// ── Write ─────────────────────────────────────────────────────────────────────

/** Persists social posting preferences for the current player. */
export async function saveSocialPostPrefsAction(
  prefs: SocialPostPrefs,
): Promise<{ success?: true; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin.from('player_profiles') as any).upsert(
    { player_id: user.id, social_post_prefs: prefs },
    { onConflict: 'player_id' },
  );

  if (error) return { error: error.message };
  revalidatePath('/settings/social');
  return { success: true };
}

/** Marks an OAuth connection inactive (soft-disconnect). */
export async function disconnectSocialAccountAction(
  platform: OAuthPlatform,
): Promise<{ success?: true; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('social_connections')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('player_id', user.id)
    .eq('platform', platform);

  if (error) return { error: error.message };
  revalidatePath('/settings/social');
  return { success: true };
}

// ── Internal helper (called by OAuth callback route) ─────────────────────────

/**
 * Upserts a social connection after OAuth token exchange.
 * Called from /api/social/callback/[platform] — uses admin client.
 */
export async function upsertSocialConnectionAction(params: {
  playerId: string;
  platform: OAuthPlatform;
  platformUserId: string;
  platformUsername: string | null;
  platformDisplayName: string | null;
  accessToken: string;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
  scopes: string[];
}): Promise<{ success?: true; error?: string }> {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any)
    .from('social_connections')
    .upsert(
      {
        player_id:             params.playerId,
        platform:              params.platform,
        platform_user_id:      params.platformUserId,
        platform_username:     params.platformUsername,
        platform_display_name: params.platformDisplayName,
        access_token:          params.accessToken,
        refresh_token:         params.refreshToken,
        token_expires_at:      params.tokenExpiresAt?.toISOString() ?? null,
        scopes:                params.scopes,
        is_active:             true,
        connected_at:          new Date().toISOString(),
        updated_at:            new Date().toISOString(),
      },
      { onConflict: 'player_id,platform' },
    );

  if (error) return { error: error.message };
  revalidatePath('/settings/social');
  return { success: true };
}

// ── Post queue helper (called by Phase 11B worker triggers) ──────────────────

/**
 * Returns connections + prefs for a player to determine what/where to post.
 * Used by the Phase 11B ECS Fargate job when a match result is confirmed.
 */
export async function getPlayerSocialConfigAction(playerId: string): Promise<{
  connections: SocialConnectionPublic[];
  prefs: SocialPostPrefs;
}> {
  const admin = createAdminClient();

  const [{ data: connData }, { data: profData }] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any)
      .from('social_connections')
      .select('platform, platform_username, platform_display_name, is_active, connected_at')
      .eq('player_id', playerId)
      .eq('is_active', true),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin.from('player_profiles') as any)
      .select('social_post_prefs')
      .eq('player_id', playerId)
      .maybeSingle(),
  ]);

  const connections = (connData ?? []) as SocialConnectionPublic[];
  const rawPrefs = (profData as Record<string, unknown> | null)?.social_post_prefs;
  const prefs: SocialPostPrefs = rawPrefs
    ? { ...DEFAULT_SOCIAL_POST_PREFS, ...(rawPrefs as Partial<SocialPostPrefs>) }
    : DEFAULT_SOCIAL_POST_PREFS;

  return { connections, prefs };
}

// getEnabledPlatformsForTrigger is a pure utility — see @/lib/social-types

// ── Post log: pending previews ────────────────────────────────────────────────

/** Returns all posts waiting for the current player to approve or decline. */
export async function getPendingPreviewsAction(): Promise<PostLogRow[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const admin = createAdminClient();
  const { data } = await (admin as any)
    .from('social_post_log')
    .select('id, platform, trigger_type, status, graphic_url, caption, caption_style, platform_post_id, error_message, queued_at, posted_at')
    .eq('player_id', user.id)
    .eq('status', 'pending_preview')
    .order('queued_at', { ascending: false });

  return (data ?? []) as PostLogRow[];
}

/**
 * Approves a pending preview — enqueues a post job so the worker can publish it.
 * Updates post_log status to 'posting' immediately.
 */
export async function approvePreviewAction(
  postLogId: string,
): Promise<{ success?: true; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const admin = createAdminClient();

  // Fetch the log row — verify ownership + correct status
  const { data: logRow } = await (admin as any)
    .from('social_post_log')
    .select('id, player_id, platform, graphic_url, caption, trigger_type, status')
    .eq('id', postLogId)
    .maybeSingle();

  if (!logRow) return { error: 'Post not found' };
  if ((logRow as any).player_id !== user.id) return { error: 'Permission denied' };
  if ((logRow as any).status !== 'pending_preview') return { error: 'Post is not pending preview' };

  const row = logRow as { id: string; platform: string; graphic_url: string; caption: string; trigger_type: string };

  // Mark as 'posting' in DB
  await (admin as any)
    .from('social_post_log')
    .update({ status: 'posting' })
    .eq('id', postLogId);

  // Enqueue the post job (fire-and-forget — non-critical)
  try {
    const postQueue = getPostQueue();
    await postQueue.add(`approved-${postLogId}`, {
      postLogId: row.id,
      playerId: user.id,
      platform: row.platform as 'instagram' | 'facebook' | 'x',
      graphicUrl: row.graphic_url,
      caption: row.caption,
      triggerType: row.trigger_type,
    }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      jobId: `approved-${postLogId}`,
    });
  } catch (err) {
    console.error('[social] Failed to enqueue approved post job:', err);
    // Reset status back to pending_preview if enqueue fails
    await (admin as any)
      .from('social_post_log')
      .update({ status: 'pending_preview' })
      .eq('id', postLogId);
    return { error: 'Failed to queue post — please try again' };
  }

  revalidatePath('/settings/social');
  return { success: true };
}

/** Declines a pending preview — sets status to 'preview_declined'. */
export async function declinePreviewAction(
  postLogId: string,
): Promise<{ success?: true; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const admin = createAdminClient();

  const { data: logRow } = await (admin as any)
    .from('social_post_log')
    .select('player_id, status')
    .eq('id', postLogId)
    .maybeSingle();

  if (!logRow) return { error: 'Post not found' };
  if ((logRow as any).player_id !== user.id) return { error: 'Permission denied' };

  await (admin as any)
    .from('social_post_log')
    .update({ status: 'preview_declined' })
    .eq('id', postLogId);

  revalidatePath('/settings/social');
  return { success: true };
}

/** Returns the last 50 post log entries for the current player (all statuses). */
export async function getPostHistoryAction(): Promise<PostLogRow[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const admin = createAdminClient();
  const { data } = await (admin as any)
    .from('social_post_log')
    .select('id, platform, trigger_type, status, graphic_url, caption, caption_style, platform_post_id, error_message, queued_at, posted_at')
    .eq('player_id', user.id)
    .order('queued_at', { ascending: false })
    .limit(50);

  return (data ?? []) as PostLogRow[];
}

// ── Club social connections ────────────────────────────────────────────────────

/** Returns active club-level social connections (no tokens). */
export async function getClubSocialConnectionsAction(
  clubId: string,
): Promise<ClubConnectionPublic[]> {
  const admin = createAdminClient();
  const { data } = await (admin as any)
    .from('club_social_connections')
    .select('platform, platform_username, platform_display_name, is_active, connected_at')
    .eq('club_id', clubId)
    .eq('is_active', true)
    .order('connected_at', { ascending: true });

  return (data ?? []) as ClubConnectionPublic[];
}

/**
 * Upserts a club social connection after OAuth token exchange.
 * Called from /api/social/club/callback/[platform].
 */
export async function upsertClubSocialConnectionAction(params: {
  clubId: string;
  platform: OAuthPlatform;
  platformUserId: string;
  platformUsername: string | null;
  platformDisplayName: string | null;
  accessToken: string;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
  scopes: string[];
}): Promise<{ success?: true; error?: string }> {
  const admin = createAdminClient();
  const { error } = await (admin as any)
    .from('club_social_connections')
    .upsert(
      {
        club_id:               params.clubId,
        platform:              params.platform,
        platform_user_id:      params.platformUserId,
        platform_username:     params.platformUsername,
        platform_display_name: params.platformDisplayName,
        access_token:          params.accessToken,
        refresh_token:         params.refreshToken,
        token_expires_at:      params.tokenExpiresAt?.toISOString() ?? null,
        scopes:                params.scopes,
        is_active:             true,
        connected_at:          new Date().toISOString(),
        updated_at:            new Date().toISOString(),
      },
      { onConflict: 'club_id,platform' },
    );

  if (error) return { error: error.message };
  return { success: true };
}

// ── Organiser share actions ────────────────────────────────────────────────────

/**
 * Share the bracket for a category on the club's social media pages.
 * Called when the tournament manager clicks "Share draw on social" in DrawSection.
 */
export async function shareDrawOnSocialAction(
  categoryId: string,
): Promise<{ success?: true; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const admin = createAdminClient();

  // Resolve category → tournament → club
  const { data: category } = await admin
    .from('tournament_categories')
    .select('id, name, draw_format, tournament_id')
    .eq('id', categoryId)
    .single();
  if (!category) return { error: 'Category not found' };

  const tournamentId = (category as { tournament_id: string }).tournament_id;

  const { data: tournament } = await admin
    .from('tournaments')
    .select('club_id')
    .eq('id', tournamentId)
    .single();
  if (!tournament) return { error: 'Tournament not found' };

  // Verify manager role
  const { data: mgr } = await admin
    .from('club_managers')
    .select('role')
    .eq('club_id', tournament.club_id)
    .eq('player_id', user.id)
    .maybeSingle();
  if (!mgr) return { error: 'Permission denied' };

  // Count active entries in this category
  const { count: participantCount } = await admin
    .from('tournament_entries')
    .select('id', { count: 'exact', head: true })
    .eq('category_id', categoryId)
    .eq('status', 'active');

  try {
    await enqueueDrawPublished({
      tournamentId,
      clubId:           tournament.club_id,
      categoryId,
      categoryName:     (category as { name: string }).name,
      participantCount: participantCount ?? 0,
      drawFormat:       (category as { draw_format: string }).draw_format,
    });
  } catch (err) {
    console.error('[social] enqueueDrawPublished failed:', err);
    return { error: 'Failed to queue social post' };
  }

  return { success: true };
}

/**
 * Share the match schedule for a tournament on the club's social media pages.
 * Called when the tournament manager clicks "Share schedule on social".
 */
export async function shareScheduleOnSocialAction(
  tournamentId: string,
): Promise<{ success?: true; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const admin = createAdminClient();

  const { data: tournament } = await admin
    .from('tournaments')
    .select('club_id')
    .eq('id', tournamentId)
    .single();
  if (!tournament) return { error: 'Tournament not found' };

  const { data: mgr } = await admin
    .from('club_managers')
    .select('role')
    .eq('club_id', tournament.club_id)
    .eq('player_id', user.id)
    .maybeSingle();
  if (!mgr) return { error: 'Permission denied' };

  // Count scheduled matches
  const { count: matchCount } = await admin
    .from('matches')
    .select('id', { count: 'exact', head: true })
    .eq('tournament_id', tournamentId)
    .not('scheduled_time', 'is', null);

  try {
    await enqueueScheduleReleased({
      tournamentId,
      clubId:     tournament.club_id,
      matchCount: matchCount ?? 0,
    });
  } catch (err) {
    console.error('[social] enqueueScheduleReleased failed:', err);
    return { error: 'Failed to queue social post' };
  }

  return { success: true };
}

/** Returns the organiser post history for a club (last 30 rows). */
export async function getClubPostHistoryAction(
  clubId: string,
): Promise<PostLogRow[]> {
  const admin = createAdminClient();
  const { data } = await (admin as any)
    .from('social_post_log')
    .select('id, platform, trigger_type, status, graphic_url, caption, caption_style, platform_post_id, error_message, queued_at, posted_at')
    .eq('club_id', clubId)
    .order('queued_at', { ascending: false })
    .limit(30);

  return (data ?? []) as PostLogRow[];
}

/** Marks a club social connection as inactive (soft-disconnect). */
export async function disconnectClubSocialAccountAction(
  clubId: string,
  platform: OAuthPlatform,
): Promise<{ success?: true; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  // Verify user is a manager of this club
  const admin = createAdminClient();
  const { data: mgr } = await admin
    .from('club_managers')
    .select('role')
    .eq('club_id', clubId)
    .eq('player_id', user.id)
    .maybeSingle();
  if (!mgr) return { error: 'Permission denied' };

  const { error } = await (admin as any)
    .from('club_social_connections')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('club_id', clubId)
    .eq('platform', platform);

  if (error) return { error: error.message };
  return { success: true };
}
