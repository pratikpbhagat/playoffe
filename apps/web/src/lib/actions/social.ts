'use server';

import { revalidatePath } from 'next/cache';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import type {
  SocialConnectionPublic,
  SocialPostPrefs,
  OAuthPlatform,
} from '@/lib/social-types';
import { DEFAULT_SOCIAL_POST_PREFS } from '@/lib/social-types';

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
