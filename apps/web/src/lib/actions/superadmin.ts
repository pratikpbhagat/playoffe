'use server';

/**
 * Super Admin server actions.
 *
 * All write operations require the caller to hold the super_admin JWT claim.
 * All reads use the admin client (service role) to bypass RLS.
 */

import { createAdminClient, createClient, getCurrentUser, isSuperAdmin } from '@/lib/supabase/server';
import { sendEmail } from '@/lib/email/service';
import { buildAdminInviteEmail } from '@/lib/email/templates/admin-invite';
import { revalidatePath } from 'next/cache';
import { revalidateFeatureFlags, revalidatePermissions } from '@/lib/supabase/permissions';
import crypto from 'crypto';
import type { User } from '@supabase/supabase-js';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

// ── Guard ────────────────────────────────────────────────────────────────────

async function assertSuperAdmin() {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!isSuperAdmin(user)) throw new Error('Forbidden: Super Admin only');
  return { user: user!, admin: createAdminClient() };
}

// ── Audit log helper ─────────────────────────────────────────────────────────

async function writeAuditLog(opts: {
  admin: ReturnType<typeof createAdminClient>;
  actorId: string;
  actionType: string;
  targetType?: string;
  targetId?: string;
  oldValue?: unknown;
  newValue?: unknown;
  metadata?: unknown;
}) {
  const { admin, actorId, actionType, targetType, targetId, oldValue, newValue, metadata } = opts;
  await admin.from('audit_log' as any).insert({
    action_type: actionType,
    actor_id: actorId,
    target_type: targetType ?? null,
    target_id: targetId ?? null,
    old_value: oldValue ?? null,
    new_value: newValue ?? null,
    metadata: metadata ?? null,
  });
}

// ── Platform stats ────────────────────────────────────────────────────────────

export async function getPlatformStatsAction() {
  const { admin } = await assertSuperAdmin();

  const [
    { count: clubCount },
    { count: playerCount },
    { count: tournamentCount },
    { count: matchCount },
  ] = await Promise.all([
    admin.from('clubs').select('*', { count: 'exact', head: true }),
    admin.from('players').select('*', { count: 'exact', head: true }),
    admin.from('tournaments')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'in_progress'),
    admin.from('matches').select('*', { count: 'exact', head: true }),
  ]);

  return {
    totalClubs: clubCount ?? 0,
    totalPlayers: playerCount ?? 0,
    activeTournaments: tournamentCount ?? 0,
    totalMatches: matchCount ?? 0,
  };
}

// ── User management ──────────────────────────────────────────────────────────

export async function getAllUsersForSuperAdminAction() {
  const { admin } = await assertSuperAdmin();

  // Fetch all auth users — service role bypasses auth restrictions, paginate to avoid the 1000-user cap
  const allAuthUsers: User[] = [];
  for (let page = 1; ; page++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    const batch = data?.users ?? [];
    allAuthUsers.push(...batch);
    if (batch.length < 1000) break;
  }
  const users = allAuthUsers.filter((u) => u.app_metadata?.role !== 'super_admin');

  // Fetch all player profiles + club memberships in parallel
  const [{ data: players }, { data: managers }] = await Promise.all([
    admin.from('players').select('id, username, full_name, is_provisional'),
    admin.from('club_managers').select('player_id, clubs(id, name, slug)'),
  ]);

  const playerMap = new Map((players ?? []).map((p) => [p.id, p]));

  // Build player_id → clubs[] map
  type ClubRef = { id: string; name: string; slug: string };
  const clubsByPlayer = new Map<string, ClubRef[]>();
  for (const m of managers ?? []) {
    const club = m.clubs as ClubRef | null;
    if (!club) continue;
    const list = clubsByPlayer.get(m.player_id) ?? [];
    list.push(club);
    clubsByPlayer.set(m.player_id, list);
  }

  return users.map((u) => {
    const player = playerMap.get(u.id);
    return {
      id: u.id,
      email: u.email ?? '',
      created_at: u.created_at,
      last_sign_in_at: (u.last_sign_in_at as string | null | undefined) ?? null,
      roles: (u.app_metadata?.roles as string[] | undefined) ?? [],
      username: player?.username ?? null,
      full_name: player?.full_name ?? null,
      is_provisional: player?.is_provisional ?? false,
      clubs: clubsByPlayer.get(u.id) ?? [],
    };
  });
}

export type UserRow = Awaited<ReturnType<typeof getAllUsersForSuperAdminAction>>[number];

/**
 * Generates a Supabase password-recovery link for the given user and returns
 * it so the super admin can copy / share it directly.
 */
export async function generatePasswordResetLinkAction(userId: string) {
  const { user: actor, admin } = await assertSuperAdmin();

  const { data: { user }, error: fetchErr } = await admin.auth.admin.getUserById(userId);
  if (fetchErr || !user?.email) return { error: 'User not found' };

  const { data, error } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email: user.email,
  });

  if (error || !data?.properties?.action_link) {
    return { error: 'Failed to generate reset link. Try again.' };
  }

  await writeAuditLog({
    admin,
    actorId: actor.id,
    actionType: 'user_reset_link_generated',
    targetType: 'user',
    targetId: userId,
    metadata: { email: user.email },
  });

  return { success: true as const, resetLink: data.properties.action_link };
}

/**
 * Directly sets a new password for a user. Super admin only.
 */
export async function setUserPasswordAction(userId: string, newPassword: string) {
  const { user: actor, admin } = await assertSuperAdmin();

  if (newPassword.length < 8) return { error: 'Password must be at least 8 characters' };

  const { error } = await admin.auth.admin.updateUserById(userId, { password: newPassword });
  if (error) return { error: error.message };

  await writeAuditLog({
    admin,
    actorId: actor.id,
    actionType: 'user_password_set_by_admin',
    targetType: 'user',
    targetId: userId,
  });

  return { success: true as const };
}

/**
 * Finds every non-super-admin auth user whose app_metadata.roles does NOT
 * include 'player' and adds 'player' to their roles.
 * Safe to run multiple times — already-correct users are skipped.
 */
export async function backfillPlayerRoleAction() {
  const { user: actor, admin } = await assertSuperAdmin();

  const { data: authList } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const users = (authList?.users ?? []).filter(
    (u) => u.app_metadata?.role !== 'super_admin',
  );

  const toFix = users.filter((u) => {
    const roles = (u.app_metadata?.roles as string[] | undefined) ?? [];
    return !roles.includes('player');
  });

  await Promise.all(
    toFix.map((u) => {
      const existingRoles = (u.app_metadata?.roles as string[] | undefined) ?? [];
      return admin.auth.admin.updateUserById(u.id, {
        app_metadata: { ...u.app_metadata, roles: Array.from(new Set([...existingRoles, 'player'])) },
      });
    }),
  );

  if (toFix.length > 0) {
    await writeAuditLog({
      admin,
      actorId: actor.id,
      actionType: 'player_role_backfill',
      metadata: { count: toFix.length, userIds: toFix.map((u) => u.id) },
    });
  }

  revalidatePath('/superadmin/users');
  return { success: true as const, fixed: toFix.length };
}

// ── Club management ───────────────────────────────────────────────────────────

export async function getAllClubsAction() {
  const { admin } = await assertSuperAdmin();

  const { data: clubs } = await (admin.from('clubs') as any)
    .select('id, name, slug, subscription_tier, is_suspended, created_at')
    .order('created_at', { ascending: false }) as {
      data: Array<{
        id: string;
        name: string;
        slug: string;
        subscription_tier: string;
        is_suspended: boolean | null;
        created_at: string;
      }> | null;
    };

  const { data: planLimits } = await (admin.from('plan_limits') as any).select('*') as {
    data: Array<{
      tier: string;
      max_active_tournaments: number | null;
      max_participants_per_tournament: number | null;
      max_categories_per_tournament: number | null;
      max_club_managers: number | null;
    }> | null;
  };
  const limitsByTier = new Map((planLimits ?? []).map((p) => [p.tier, p]));

  const clubList = clubs ?? [];

  // Active tournament counts per club, in one query
  const { data: tournamentCounts } = await (admin.from('tournaments') as any)
    .select('club_id')
    .in('status', ['draft', 'registration_open', 'in_progress']) as {
      data: Array<{ club_id: string }> | null;
    };
  const activeCountByClub = new Map<string, number>();
  for (const row of tournamentCounts ?? []) {
    activeCountByClub.set(row.club_id, (activeCountByClub.get(row.club_id) ?? 0) + 1);
  }

  return clubList.map((club) => {
    const limits = limitsByTier.get(club.subscription_tier);
    return {
      ...club,
      activeTournaments: activeCountByClub.get(club.id) ?? 0,
      maxActiveTournaments: limits?.max_active_tournaments ?? null,
    };
  });
}

export async function suspendClubAction(clubId: string, suspend: boolean) {
  const { user, admin } = await assertSuperAdmin();

  const { data: club } = await admin.from('clubs').select('name').eq('id', clubId).single();

  await admin.from('clubs').update({ is_suspended: suspend } as any).eq('id', clubId);

  await writeAuditLog({
    admin,
    actorId: user.id,
    actionType: suspend ? 'club_suspended' : 'club_reactivated',
    targetType: 'club',
    targetId: clubId,
    newValue: { name: club?.name, is_suspended: suspend },
  });

  revalidatePath('/superadmin/clubs');
  return { success: true };
}

// ── Player search (used by ClubManagersPanel & CreateClubForm) ───────────────

export async function searchPlayersAction(query: string) {
  await assertSuperAdmin();
  const admin = createAdminClient();
  const { data } = await admin.rpc('search_players_for_assignment' as any, {
    p_query: query.trim(),
    p_limit: 10,
  });
  return (data ?? []) as Array<{ id: string; full_name: string; username: string; email: string }>;
}

// ── Direct club creation by super admin ──────────────────────────────────────

export async function createClubAsSuperAdminAction(input: {
  name: string;
  subscriptionTier: 'free' | 'starter' | 'pro' | 'enterprise';
  ownerId?: string; // optional — existing player UUID
}) {
  const { user, admin } = await assertSuperAdmin();
  const { name, subscriptionTier, ownerId } = input;

  // Generate unique slug
  const baseSlug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  // Ensure uniqueness by appending a random suffix if needed
  let slug = baseSlug;
  const { data: existing } = await admin.from('clubs').select('id').eq('slug', slug).maybeSingle();
  if (existing) {
    slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
  }

  const { data: club, error: clubError } = await admin
    .from('clubs')
    .insert({ name, slug, subscription_tier: subscriptionTier } as any)
    .select('id, name, slug')
    .single() as { data: { id: string; name: string; slug: string } | null; error: unknown };

  if (clubError || !club) return { error: 'Failed to create club. The name may already be taken.' };

  if (ownerId) {
    // Fetch owner's current JWT metadata so we can merge roles
    const { data: ownerAuth } = await admin.auth.admin.getUserById(ownerId);
    if (!ownerAuth?.user) return { error: 'Club created but the selected owner account was not found.' };

    // Add as owner in club_managers
    await admin.from('club_managers').insert({
      club_id: club.id,
      player_id: ownerId,
      role: 'owner',
    });

    // Add user_role (idempotent)
    await admin.from('user_roles' as any).upsert(
      { user_id: ownerId, role: 'admin', club_id: club.id },
      { onConflict: 'user_id,role,club_id' },
    );

    // Merge JWT roles — both 'admin' and 'player' required for role toggle
    const currentRoles = (ownerAuth.user.app_metadata?.roles as string[] | undefined) ?? [];
    const newRoles = Array.from(new Set([...currentRoles, 'admin', 'player']));
    await admin.auth.admin.updateUserById(ownerId, {
      app_metadata: { ...ownerAuth.user.app_metadata, roles: newRoles },
    });

    await writeAuditLog({
      admin,
      actorId: user.id,
      actionType: 'club_created_with_owner',
      targetType: 'club',
      targetId: club.id,
      newValue: { name, slug, subscriptionTier, ownerId },
    });
  } else {
    await writeAuditLog({
      admin,
      actorId: user.id,
      actionType: 'club_created_direct',
      targetType: 'club',
      targetId: club.id,
      newValue: { name, slug, subscriptionTier },
    });
  }

  revalidatePath('/superadmin/clubs');
  return { success: true as const, club };
}

// ── Admin invite flow ─────────────────────────────────────────────────────────

export async function createAdminInviteAction(input: {
  clubName: string;
  inviteeEmail: string;
  inviteeName: string;
  subscriptionTier?: 'free' | 'starter' | 'pro' | 'enterprise';
  expiryDays?: number;
}) {
  const { user, admin } = await assertSuperAdmin();

  const {
    clubName,
    inviteeEmail,
    inviteeName,
    subscriptionTier = 'free',
    expiryDays = 7,
  } = input;

  // Generate a cryptographically random token
  const token = crypto.randomBytes(32).toString('hex');

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expiryDays);

  const { error } = await admin.from('admin_invites' as any).insert({
    club_name: clubName,
    invitee_email: inviteeEmail,
    invitee_name: inviteeName,
    subscription_tier: subscriptionTier,
    token,
    expires_at: expiresAt.toISOString(),
    created_by: user.id,
  });

  if (error) return { error: 'Failed to create invite' };

  // Send invite email
  const inviteUrl = `${APP_URL}/invite/${token}`;
  const payload = buildAdminInviteEmail({
    clubName,
    inviteeName,
    inviteUrl,
    expiresAt: expiresAt.toISOString(),
    appUrl: APP_URL,
  });
  await sendEmail({ to: inviteeEmail, ...payload });

  await writeAuditLog({
    admin,
    actorId: user.id,
    actionType: 'admin_invite_created',
    targetType: 'admin_invite',
    newValue: { clubName, inviteeEmail, inviteeName, expiresAt },
  });

  revalidatePath('/superadmin/invitations');
  return { success: true as const, inviteUrl };
}

export async function revokeAdminInviteAction(inviteId: string) {
  const { user, admin } = await assertSuperAdmin();

  await admin
    .from('admin_invites' as any)
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', inviteId);

  await writeAuditLog({
    admin,
    actorId: user.id,
    actionType: 'admin_invite_revoked',
    targetType: 'admin_invite',
    targetId: inviteId,
  });

  revalidatePath('/superadmin/clubs');
  return { success: true };
}

export async function getAdminInvitesAction() {
  const { admin } = await assertSuperAdmin();

  const { data } = await admin
    .from('admin_invites' as any)
    .select('id, club_name, invitee_email, invitee_name, subscription_tier, expires_at, claimed_at, revoked_at, created_at')
    .order('created_at', { ascending: false });

  return (data ?? []) as unknown as Array<{
    id: string;
    club_name: string;
    invitee_email: string;
    invitee_name: string | null;
    subscription_tier: string;
    expires_at: string;
    claimed_at: string | null;
    revoked_at: string | null;
    created_at: string;
  }>;
}

/**
 * Returns all PENDING (not claimed, not revoked, not expired) invites for a specific club.
 * Used by ClubManagersPanel to show outstanding invites with a revoke option.
 */
export async function getClubPendingInvitesAction(clubId: string) {
  const { admin } = await assertSuperAdmin();
  const { data } = await admin
    .from('admin_invites' as any)
    .select('id, invitee_email, invitee_name, expires_at, token')
    .eq('club_id', clubId)
    .is('claimed_at', null)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false });
  return (data ?? []) as unknown as Array<{
    id: string;
    invitee_email: string;
    invitee_name: string | null;
    expires_at: string;
    token: string;
  }>;
}

/**
 * Called from the /invite/[token] claim page (no auth required — caller is the invitee).
 * Validates the token, creates a Supabase auth user, and either:
 *   - creates a new club + adds user as owner (invite_type = 'new_club_owner'), or
 *   - adds the user as manager to an existing club (invite_type = 'existing_club_manager').
 */
export async function claimAdminInviteAction(input: {
  token: string;
  password: string;
  fullName: string;
  username: string;
}) {
  const admin = createAdminClient();
  const { token, password, fullName, username } = input;

  // 1. Validate the invite token
  const { data: invite } = await admin
    .from('admin_invites' as any)
    .select('id, club_name, club_id, invite_type, invitee_email, invitee_name, subscription_tier, expires_at, claimed_at, revoked_at')
    .eq('token', token)
    .single() as { data: {
      id: string; club_name: string; club_id: string | null; invite_type: string;
      invitee_email: string; invitee_name: string | null;
      subscription_tier: string; expires_at: string; claimed_at: string | null; revoked_at: string | null;
    } | null };

  if (!invite) return { error: 'Invalid invite link.' };
  if (invite.revoked_at) return { error: 'This invite has been revoked. Contact the platform administrator.' };
  if (invite.claimed_at) return { error: 'This invite has already been used.' };
  if (new Date(invite.expires_at) < new Date()) return { error: 'This invite link has expired. Contact the platform administrator.' };

  // 2. Check if this email already has a Supabase auth account
  const { data: existingUsers } = await admin.auth.admin.listUsers();
  const existingUser = existingUsers?.users.find((u) => u.email === invite.invitee_email);

  let authUserId: string;

  if (existingUser) {
    // Path A: existing player gets the Admin role added
    authUserId = existingUser.id;
  } else {
    // Path B: create a new Supabase auth account
    const { data: newUser, error: createError } = await admin.auth.admin.createUser({
      email: invite.invitee_email,
      password,
      email_confirm: true,
      app_metadata: { roles: ['player'] },  // default to player; club manager branch adds 'admin'
    });
    if (createError || !newUser.user) {
      return { error: createError?.message ?? 'Failed to create account.' };
    }
    authUserId = newUser.user.id;

    // Create the players record
    const usernameSlug = username.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    await admin.from('players').insert({
      id: authUserId,
      email: invite.invitee_email,
      full_name: fullName,
      username: usernameSlug,
      gender: 'other' as const,
    });
  }

  // ── Branch: existing_club_manager — join an existing club ────────────────────
  if (invite.invite_type === 'existing_club_manager' && invite.club_id) {
    // Add as manager to the existing club
    const { error: mgrErr } = await admin.from('club_managers').insert({
      club_id: invite.club_id,
      player_id: authUserId,
      role: 'manager',
    });
    if (mgrErr) return { error: 'Failed to add you as manager. You may already be a manager of this club.' };

    // Insert user_roles row
    await admin.from('user_roles' as any).insert({
      user_id: authUserId,
      role: 'admin',
      club_id: invite.club_id,
    });

    // Update JWT app_metadata roles — ensure both 'admin' and 'player' for role toggle
    const currentRoles = existingUser?.app_metadata?.roles as string[] ?? [];
    const newRoles = Array.from(new Set([...currentRoles, 'admin', 'player']));
    await admin.auth.admin.updateUserById(authUserId, {
      app_metadata: { ...existingUser?.app_metadata, roles: newRoles },
    });

    // Mark claimed
    await admin.from('admin_invites' as any).update({ claimed_at: new Date().toISOString() }).eq('id', invite.id);

    await admin.from('audit_log' as any).insert({
      action_type: 'manager_invite_claimed',
      actor_id: authUserId,
      target_type: 'admin_invite',
      target_id: invite.id,
      new_value: { club_id: invite.club_id, club_name: invite.club_name },
    });

    return { success: true };
  }

  // ── Branch: new_club_owner — create a new club ───────────────────────────────

  // 3. Create the club
  const clubSlug = invite.club_name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  const { data: club, error: clubError } = await admin.from('clubs').insert({
    name: invite.club_name,
    slug: clubSlug,
    subscription_tier: invite.subscription_tier as 'free' | 'starter' | 'pro' | 'enterprise',
  }).select('id').single();

  if (clubError || !club) {
    return { error: 'Failed to create club. The club name may already be taken.' };
  }

  // 4. Add the user to club_managers as owner (existing system)
  await admin.from('club_managers').insert({
    club_id: club.id,
    player_id: authUserId,
    role: 'owner',
  });

  // 5. Insert user_roles row
  await admin.from('user_roles' as any).insert({
    user_id: authUserId,
    role: 'admin',
    club_id: club.id,
  });

  // 6. Update JWT app_metadata to include roles[] (both 'admin' and 'player' for role toggle)
  const currentRoles = existingUser?.app_metadata?.roles as string[] ?? [];
  const newRoles = Array.from(new Set([...currentRoles, 'admin', 'player']));
  await admin.auth.admin.updateUserById(authUserId, {
    app_metadata: {
      ...existingUser?.app_metadata,
      roles: newRoles,
    },
  });

  // 7. Mark invite as claimed
  await admin
    .from('admin_invites' as any)
    .update({ claimed_at: new Date().toISOString() })
    .eq('id', invite.id);

  await admin.from('audit_log' as any).insert({
    action_type: 'admin_invite_claimed',
    actor_id: authUserId,
    target_type: 'admin_invite',
    target_id: invite.id,
    new_value: { club_id: club.id, club_name: invite.club_name },
  });

  return { success: true };
}

// ── Feature flags ─────────────────────────────────────────────────────────────

export async function getFeatureFlagsAction() {
  const { admin } = await assertSuperAdmin();
  const { data } = await admin.from('feature_flags' as any).select('id, feature_module, is_enabled, updated_at').order('feature_module');
  return (data ?? []) as unknown as Array<{ id: string; feature_module: string; is_enabled: boolean; updated_at: string }>;
}

export async function updateFeatureFlagAction(flagId: string, isEnabled: boolean) {
  const { user, admin } = await assertSuperAdmin();

  const { data: flag } = await admin.from('feature_flags' as any).select('feature_module, is_enabled').eq('id', flagId).single() as { data: { feature_module: string; is_enabled: boolean } | null };

  await admin
    .from('feature_flags' as any)
    .update({ is_enabled: isEnabled, updated_by: user.id, updated_at: new Date().toISOString() })
    .eq('id', flagId);

  await writeAuditLog({
    admin,
    actorId: user.id,
    actionType: 'feature_flag_updated',
    targetType: 'feature_flag',
    targetId: flagId,
    oldValue: { is_enabled: flag?.is_enabled },
    newValue: { feature_module: flag?.feature_module, is_enabled: isEnabled },
  });

  revalidatePath('/superadmin/flags');
  // Bust the entire layout cache so feature-gated tabs (e.g. Social media in
  // /settings) appear/disappear immediately without a manual hard-refresh.
  revalidatePath('/', 'layout');
  revalidateFeatureFlags();
  return { success: true };
}

// ── RBAC permissions ──────────────────────────────────────────────────────────

export async function getRolePermissionsAction(clubId?: string) {
  const { admin } = await assertSuperAdmin();

  // Fetch global defaults + optional club overrides in one query
  const query = admin
    .from('role_permissions' as any)
    .select('id, role, feature, sub_feature, is_enabled, can_read, can_write, scope, club_id, updated_at')
    .order('feature')
    .order('sub_feature');

  if (clubId) {
    (query as any).or(`scope.eq.global,club_id.eq.${clubId}`);
  } else {
    (query as any).eq('scope', 'global');
  }

  const { data } = await query;
  return (data ?? []) as unknown as Array<{
    id: string;
    role: string;
    feature: string;
    sub_feature: string | null;
    is_enabled: boolean;
    can_read: boolean;
    can_write: boolean;
    scope: string;
    club_id: string | null;
    updated_at: string;
  }>;
}

export async function updateRolePermissionAction(input: {
  role: string;
  feature: string;
  subFeature?: string;
  isEnabled: boolean;
  canRead: boolean;
  canWrite: boolean;
  scope: 'global' | 'club';
  clubId?: string;
}) {
  const { user, admin } = await assertSuperAdmin();
  const { role, feature, subFeature, isEnabled, canRead, canWrite, scope, clubId } = input;

  // Fetch current value for audit — must filter by sub_feature and club_id too,
  // otherwise maybeSingle() returns an error when multiple sub-feature rows exist.
  const lookupQuery = admin
    .from('role_permissions' as any)
    .select('id, is_enabled, can_read, can_write')
    .eq('role', role)
    .eq('feature', feature)
    .eq('scope', scope);

  if (subFeature) {
    (lookupQuery as any).eq('sub_feature', subFeature);
  } else {
    (lookupQuery as any).is('sub_feature', null);
  }

  if (scope === 'club' && clubId) {
    (lookupQuery as any).eq('club_id', clubId);
  }

  const { data: current } = await (lookupQuery as any).maybeSingle() as { data: { id: string; is_enabled: boolean; can_read: boolean; can_write: boolean } | null };

  const now = new Date().toISOString();

  if (current) {
    // Update existing row
    await admin
      .from('role_permissions' as any)
      .update({ is_enabled: isEnabled, can_read: canRead, can_write: canWrite, updated_by: user.id, updated_at: now })
      .eq('id', current.id);
  } else {
    // Insert new club-level override
    await admin.from('role_permissions' as any).insert({
      role,
      feature,
      sub_feature: subFeature ?? null,
      is_enabled: isEnabled,
      can_read: canRead,
      can_write: canWrite,
      scope,
      club_id: clubId ?? null,
      updated_by: user.id,
      updated_at: now,
    });
  }

  await writeAuditLog({
    admin,
    actorId: user.id,
    actionType: scope === 'club' ? 'permission_changed_club' : 'permission_changed_global',
    targetType: 'role_permission',
    metadata: { role, feature, subFeature, scope, clubId },
    oldValue: current ? { is_enabled: current.is_enabled, can_read: current.can_read, can_write: current.can_write } : null,
    newValue: { is_enabled: isEnabled, can_read: canRead, can_write: canWrite },
  });

  revalidatePath('/superadmin/rbac');
  revalidatePermissions();
  return { success: true };
}

export async function resetClubPermissionsAction(clubId: string) {
  const { user, admin } = await assertSuperAdmin();

  // Delete all club-specific overrides for this club
  await admin.from('role_permissions' as any).delete().eq('scope', 'club').eq('club_id', clubId);

  await writeAuditLog({
    admin,
    actorId: user.id,
    actionType: 'permissions_reset_to_global',
    targetType: 'club',
    targetId: clubId,
  });

  revalidatePath('/superadmin/rbac');
  revalidatePermissions();
  return { success: true };
}

// ── Dual-role: Admin → activate player profile ────────────────────────────────

export async function activatePlayerProfileAction() {
  'use server';
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return { error: 'Not authenticated' };

  const roles = (user.app_metadata?.roles as string[] | undefined) ?? [];
  if (roles.includes('player')) return { error: 'Player profile already active' };
  if (!roles.includes('admin')) return { error: 'Only admin accounts can activate a player profile' };

  const admin = createAdminClient();

  // Insert player role
  await (admin.from('user_roles' as any).insert({ user_id: user.id, role: 'player', club_id: null }));

  // Create global_stats row if missing
  const { data: existing } = await admin
    .from('global_stats')
    .select('player_id')
    .eq('player_id', user.id)
    .maybeSingle();
  if (!existing) {
    await admin.from('global_stats').insert({ player_id: user.id });
  }

  // Update JWT app_metadata to add 'player' to roles[]
  await admin.auth.admin.updateUserById(user.id, {
    app_metadata: { ...user.app_metadata, roles: [...roles, 'player'] },
  });

  revalidatePath('/settings/account');
  return { success: true };
}

// ── Tournament management (superadmin) ───────────────────────────────────────

export async function createTournamentAsSuperAdminAction(input: {
  clubId: string;
  name: string;
  slug: string;
  startDate: string;
  endDate: string;
  venue?: string;
  status?: 'draft' | 'registration_open' | 'in_progress' | 'completed';
}) {
  const { user, admin } = await assertSuperAdmin();
  const { clubId, name, slug, startDate, endDate, venue, status = 'draft' } = input;

  const { data: tournament, error } = await (admin.from('tournaments') as any).insert({
    club_id: clubId,
    name: name.trim(),
    slug: slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/--+/g, '-').replace(/^-|-$/g, ''),
    start_date: startDate,
    end_date: endDate,
    venue: venue?.trim() ?? null,
    status,
    created_by: user.id,
    display_code: '', // DB trigger generates the actual code
  }).select('id, name, slug').single() as { data: { id: string; name: string; slug: string } | null; error: { message: string } | null };

  if (error || !tournament) return { error: error?.message ?? 'Failed to create tournament' };

  await writeAuditLog({
    admin,
    actorId: user.id,
    actionType: 'tournament_created_by_superadmin',
    targetType: 'tournament',
    targetId: tournament.id,
    newValue: { name: tournament.name, club_id: clubId },
  });

  revalidatePath('/superadmin/tournaments');
  return { success: true as const, tournament };
}

export async function getAllTournamentsForSuperAdminAction() {
  const { admin } = await assertSuperAdmin();

  const { data } = await admin
    .from('tournaments')
    .select('id, name, slug, status, start_date, end_date, venue, clubs(id, name)')
    .order('start_date', { ascending: false }) as {
      data: Array<{
        id: string; name: string; slug: string; status: string;
        start_date: string; end_date: string; venue: string | null;
        clubs: { id: string; name: string } | null;
      }> | null;
    };

  return data ?? [];
}

// ── Club manager management (superadmin) ─────────────────────────────────────

export async function getClubManagersDetailAction(clubId: string) {
  const { admin } = await assertSuperAdmin();

  const { data } = await admin
    .from('club_managers')
    .select('role, player_id, players(id, full_name, username, email)')
    .eq('club_id', clubId)
    .order('role') as {
      data: Array<{
        role: string; player_id: string;
        players: { id: string; full_name: string; username: string; email: string } | null;
      }> | null;
    };

  // Use player_id as the unique key (club_managers has composite PK)
  return (data ?? []).map((m) => ({ ...m, id: m.player_id }));
}

export async function addClubManagerDirectAction(clubId: string, email: string) {
  const { user, admin } = await assertSuperAdmin();

  // Find existing player by email
  const { data: player } = await admin
    .from('players')
    .select('id, full_name, username')
    .eq('email', email.trim().toLowerCase())
    .maybeSingle() as { data: { id: string; full_name: string; username: string } | null };

  if (!player) return { error: 'No player found with that email address.' };

  // Check that the player has an active auth.users account (they can actually log in)
  const { data: authUserData } = await admin.auth.admin.getUserById(player.id);
  if (!authUserData?.user) {
    return {
      error:
        'This player does not have an active login account. Use the "Send invite" option to send them an invitation link instead.',
    };
  }

  // Check not already a manager (club_managers has composite PK — no id column)
  const { data: existing } = await admin
    .from('club_managers')
    .select('role')
    .eq('club_id', clubId)
    .eq('player_id', player.id)
    .maybeSingle() as { data: { role: string } | null };

  if (existing) return { error: `This player is already a ${existing.role} of this club.` };

  // Insert club_managers row
  const { error: mgrErr } = await admin.from('club_managers').insert({
    club_id: clubId,
    player_id: player.id,
    role: 'manager',
  });
  if (mgrErr) return { error: 'Failed to add manager.' };

  // Insert user_roles row (idempotent)
  await admin.from('user_roles' as any).upsert({
    user_id: player.id,
    role: 'admin',
    club_id: clubId,
  }, { onConflict: 'user_id,role,club_id' });

  // Update JWT app_metadata.roles — ensure both 'admin' and 'player' for role toggle
  const currentRoles = (authUserData.user.app_metadata?.roles as string[] | undefined) ?? [];
  const newRoles = Array.from(new Set([...currentRoles, 'admin', 'player']));
  await admin.auth.admin.updateUserById(player.id, {
    app_metadata: { ...authUserData.user.app_metadata, roles: newRoles },
  });

  await writeAuditLog({
    admin,
    actorId: user.id,
    actionType: 'club_manager_added_direct',
    targetType: 'club',
    targetId: clubId,
    newValue: { player_id: player.id, email, role: 'manager' },
  });

  revalidatePath('/superadmin/clubs');
  return { success: true as const, player };
}

export async function createManagerInviteAction(input: {
  clubId: string;
  clubName: string;
  inviteeEmail: string;
  inviteeName?: string;
  expiryDays?: number;
}) {
  const { user, admin } = await assertSuperAdmin();
  const { clubId, clubName, inviteeEmail, inviteeName, expiryDays = 7 } = input;

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expiryDays);

  const { error } = await admin.from('admin_invites' as any).insert({
    club_name: clubName,
    club_id: clubId,
    invite_type: 'existing_club_manager',
    invitee_email: inviteeEmail,
    invitee_name: inviteeName ?? null,
    subscription_tier: 'free', // not used for manager invites but column is not null
    token,
    expires_at: expiresAt.toISOString(),
    created_by: user.id,
  });

  if (error) return { error: 'Failed to create invite.' };

  const inviteUrl = `${APP_URL}/invite/${token}`;

  // Send email (reuse existing template — will say "manage [club_name]")
  const payload = buildAdminInviteEmail({
    clubName,
    inviteeName: inviteeName ?? 'there',
    inviteUrl,
    expiresAt: expiresAt.toISOString(),
    appUrl: APP_URL,
  });
  await sendEmail({ to: inviteeEmail, ...payload });

  await writeAuditLog({
    admin,
    actorId: user.id,
    actionType: 'manager_invite_created',
    targetType: 'club',
    targetId: clubId,
    newValue: { inviteeEmail, clubName, expiresAt },
  });

  revalidatePath('/superadmin/clubs');
  return { success: true as const, inviteUrl };
}

// ── Referee PIN management (superadmin) ──────────────────────────────────────

export async function listRefereePinsAction(tournamentId: string) {
  const { admin } = await assertSuperAdmin();

  const { data } = await admin
    .from('tournament_referee_pins')
    .select('id, label, expires_at, is_revoked, created_at')
    .eq('tournament_id', tournamentId)
    .order('created_at', { ascending: false }) as {
      data: Array<{
        id: string; label: string; expires_at: string;
        is_revoked: boolean; created_at: string;
      }> | null;
    };

  return data ?? [];
}

export async function createRefereePinAsSuperAdminAction(tournamentId: string, label: string) {
  const { user, admin } = await assertSuperAdmin();

  const pin = String(Math.floor(100000 + Math.random() * 900000));
  const pinHash = crypto.createHash('sha256').update(pin.trim()).digest('hex');

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  const { error } = await admin.from('tournament_referee_pins').insert({
    tournament_id: tournamentId,
    pin_hash: pinHash,
    label: label.trim() || 'Referee',
    created_by: user.id,
    expires_at: expiresAt.toISOString(),
  });

  if (error) return { error: 'Failed to create PIN.' };

  await writeAuditLog({
    admin,
    actorId: user.id,
    actionType: 'referee_pin_created_by_superadmin',
    targetType: 'tournament',
    targetId: tournamentId,
    newValue: { label, expires_at: expiresAt.toISOString() },
  });

  revalidatePath('/superadmin/referees');
  return { success: true as const, pin };
}

export async function revokePinAsSuperAdminAction(pinId: string) {
  const { user, admin } = await assertSuperAdmin();

  await admin
    .from('tournament_referee_pins')
    .update({ is_revoked: true })
    .eq('id', pinId);

  await writeAuditLog({
    admin,
    actorId: user.id,
    actionType: 'referee_pin_revoked_by_superadmin',
    targetType: 'tournament_referee_pin',
    targetId: pinId,
  });

  revalidatePath('/superadmin/referees');
  return { success: true };
}

// ── Audit log ─────────────────────────────────────────────────────────────────

export async function getAuditLogAction(opts: {
  page?: number;
  actionType?: string;
  fromDate?: string;
  toDate?: string;
}) {
  const { admin } = await assertSuperAdmin();
  const { page = 1, actionType, fromDate, toDate } = opts;
  const pageSize = 50;

  let query = (admin.from('audit_log' as any) as any)
    .select('id, action_type, actor_id, target_type, target_id, old_value, new_value, metadata, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (actionType) query = query.eq('action_type', actionType);
  if (fromDate) query = query.gte('created_at', fromDate);
  if (toDate) query = query.lte('created_at', toDate);

  const { data, count } = await query;

  // Resolve actor UUIDs → player display names via secondary query
  const rawEntries = (data ?? []) as Array<{
    id: string;
    action_type: string;
    actor_id: string | null;
    target_type: string | null;
    target_id: string | null;
    old_value: unknown;
    new_value: unknown;
    metadata: unknown;
    created_at: string;
  }>;

  const actorIds = [
    ...new Set(
      rawEntries.map((e) => e.actor_id).filter((id): id is string => id != null),
    ),
  ];
  const actorMap = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: players } = await admin
      .from('players')
      .select('id, full_name, username')
      .in('id', actorIds) as {
        data: Array<{ id: string; full_name: string | null; username: string | null }> | null;
      };
    (players ?? []).forEach((p) => {
      actorMap.set(p.id, p.full_name ?? p.username ?? 'Unknown');
    });
  }

  return {
    entries: rawEntries.map((e) => ({
      ...e,
      actor_name: e.actor_id ? (actorMap.get(e.actor_id) ?? null) : null,
    })),
    total: count ?? 0,
    pageSize,
  };
}
