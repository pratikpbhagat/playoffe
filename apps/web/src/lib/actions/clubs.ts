'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient, createAdminClient } from '@/lib/supabase/server';

/** Returns the caller's club_managers role for a club, or null if not a manager. */
async function getClubManagerRole(
  admin: ReturnType<typeof createAdminClient>,
  clubId: string,
  playerId: string,
): Promise<string | null> {
  const { data } = await admin
    .from('club_managers')
    .select('role')
    .eq('club_id', clubId)
    .eq('player_id', playerId)
    .maybeSingle();
  return data?.role ?? null;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60);
}

export interface CreateClubInput {
  name: string;
  city?: string;
  location?: string;
  description?: string;
  brand_primary_color?: string;
}

export async function createClubAction(input: CreateClubInput) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { name, city, location, description, brand_primary_color = '#7c3aed' } = input;

  if (!name || name.trim().length < 2) {
    return { error: 'Club name must be at least 2 characters' };
  }

  const admin = createAdminClient();

  // Generate a unique slug
  const baseSlug = slugify(name.trim());
  let slug = baseSlug;
  let attempt = 0;
  while (true) {
    const { data: existing } = await admin
      .from('clubs')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();
    if (!existing) break;
    attempt++;
    slug = `${baseSlug}-${attempt}`;
  }

  const { data: club, error: clubError } = await admin
    .from('clubs')
    .insert({
      name: name.trim(),
      slug,
      city: city?.trim() || null,
      location: location?.trim() || null,
      description: description?.trim() || null,
      brand_primary_color,
      brand_secondary_color: '#22c55e',
    })
    .select('id')
    .single();

  if (clubError || !club) {
    return { error: 'Failed to create club. Please try again.' };
  }

  // Register creator as owner
  await admin.from('club_managers').insert({
    club_id: club.id,
    player_id: user.id,
    role: 'owner',
  });

  redirect(`/clubs/${slug}`);
}

// ── Club manager management ───────────────────────────────────────────────────

export async function getClubManagers(clubId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from('club_managers')
    .select('role, added_at, players!player_id(id, full_name, username, photo_url)')
    .eq('club_id', clubId)
    .order('added_at', { ascending: true });
  return (data ?? []).map((m) => ({
    role: m.role as string,
    added_at: m.added_at as string,
    player: m.players as { id: string; full_name: string; username: string; photo_url: string | null } | null,
  }));
}

export async function addClubManagerAction(clubId: string, username: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const admin = createAdminClient();

  // Verify caller is owner of this club
  const myRole = await getClubManagerRole(admin, clubId, user.id);
  if (myRole !== 'owner') return { error: 'Only club owners can add managers.' };

  // Look up the target player by username
  const { data: target } = await admin
    .from('players')
    .select('id, full_name')
    .eq('username', username.trim().toLowerCase())
    .maybeSingle();
  if (!target) return { error: `No player found with username @${username}.` };
  if (target.id === user.id) return { error: 'You are already a manager of this club.' };

  // Check not already a manager
  const { data: existing } = await admin
    .from('club_managers')
    .select('id')
    .eq('club_id', clubId)
    .eq('player_id', target.id)
    .maybeSingle();
  if (existing) return { error: `${target.full_name} is already a manager of this club.` };

  const { error } = await admin.from('club_managers').insert({
    club_id: clubId,
    player_id: target.id,
    role: 'manager',
  });
  if (error) return { error: 'Failed to add manager. Please try again.' };

  return { success: true, playerName: target.full_name };
}

export async function removeClubManagerAction(clubId: string, playerId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const admin = createAdminClient();

  // Verify caller is owner
  const myRole = await getClubManagerRole(admin, clubId, user.id);
  if (myRole !== 'owner') return { error: 'Only club owners can remove managers.' };

  if (playerId === user.id) return { error: 'You cannot remove yourself as owner.' };

  await admin.from('club_managers').delete().eq('club_id', clubId).eq('player_id', playerId);

  return { success: true };
}

export async function getMyClubs() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const admin = createAdminClient();
  const { data } = await admin
    .from('club_managers')
    .select('clubs(id, name, slug, brand_primary_color, city, location)')
    .eq('player_id', user.id)
    .order('added_at', { ascending: false });

  return (data ?? []).flatMap((m) => (m.clubs ? [m.clubs] : []));
}

// ── Club Members ──────────────────────────────────────────────────────────────

export interface ClubMember {
  player_id: string;
  is_current: boolean;
  joined_at: string;
  full_name: string;
  username: string;
  photo_url: string | null;
  location: string | null;
  current_rating: number | null;
}

export async function getClubMembersAction(clubId: string): Promise<ClubMember[]> {
  const admin = createAdminClient();

  const { data } = await admin
    .from('club_affiliations')
    .select('player_id, is_current, joined_at, players!player_id(full_name, username, photo_url, location)')
    .eq('club_id', clubId)
    .order('is_current', { ascending: false })
    .order('joined_at', { ascending: true });

  const rows = data ?? [];
  if (rows.length === 0) return [];

  // Batch-fetch ratings
  const playerIds = rows.map((r) => r.player_id as string);
  const { data: statsRows } = await admin
    .from('global_stats')
    .select('player_id, current_rating')
    .in('player_id', playerIds);
  const statsMap = new Map<string, number>(
    (statsRows ?? []).map((s) => [s.player_id as string, s.current_rating as number]),
  );

  return rows.map((row) => {
    const player = row.players as { full_name: string; username: string; photo_url: string | null; location: string | null } | null;
    return {
      player_id: row.player_id as string,
      is_current: row.is_current as boolean,
      joined_at: row.joined_at as string,
      full_name: player?.full_name ?? 'Unknown',
      username: player?.username ?? 'unknown',
      photo_url: player?.photo_url ?? null,
      location: player?.location ?? null,
      current_rating: statsMap.get(row.player_id as string) ?? null,
    };
  });
}

export async function addClubMemberAction(clubId: string, clubSlug: string, username: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const admin = createAdminClient();

  // Verify caller is a manager or owner of this club
  const myRole = await getClubManagerRole(admin, clubId, user.id);
  if (!myRole) return { error: 'Not authorized.' };

  // Look up target player by username
  const { data: target } = await admin
    .from('players')
    .select('id, full_name')
    .eq('username', username.trim().toLowerCase())
    .maybeSingle();
  if (!target) return { error: `No player found with username @${username}.` };

  // Check for an existing affiliation row
  const { data: existing } = await admin
    .from('club_affiliations')
    .select('player_id, is_current')
    .eq('club_id', clubId)
    .eq('player_id', target.id)
    .maybeSingle();

  if (existing) {
    if (existing.is_current) {
      return { error: `${target.full_name} is already an active member of this club.` };
    }
    // Re-activate a past member
    await admin
      .from('club_affiliations')
      .update({ is_current: true })
      .eq('club_id', clubId)
      .eq('player_id', target.id);
  } else {
    const { error } = await admin.from('club_affiliations').insert({
      club_id: clubId,
      player_id: target.id,
      is_current: true,
    });
    if (error) return { error: 'Failed to add member. Please try again.' };
  }

  revalidatePath(`/clubs/${clubSlug}/members`);
  return { success: true, playerName: target.full_name };
}

export async function removeClubMemberAction(clubId: string, clubSlug: string, playerId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const admin = createAdminClient();

  // Only owners can remove members
  const { data: myRole } = await admin
    .from('club_managers')
    .select('role')
    .eq('club_id', clubId)
    .eq('player_id', user.id)
    .maybeSingle();
  if (!myRole || myRole.role !== 'owner') return { error: 'Only club owners can remove members.' };

  const { error } = await admin
    .from('club_affiliations')
    .update({ is_current: false })
    .eq('club_id', clubId)
    .eq('player_id', playerId);

  if (error) return { error: 'Failed to remove member. Please try again.' };

  revalidatePath(`/clubs/${clubSlug}/members`);
  return { success: true };
}

// ── Club Analytics ────────────────────────────────────────────────────────────

export interface ClubTopMember {
  player_id: string;
  full_name: string;
  username: string;
  current_rating: number;
  wins: number;
  losses: number;
}

export interface ClubAnalytics {
  totalMembers: number;
  totalTournaments: number;
  activeTournaments: number;
  completedTournaments: number;
  avgRating: number;
  topMembers: ClubTopMember[];
  recentTournaments: Array<{ id: string; name: string; start_date: string; status: string }>;
}

export async function getClubAnalyticsAction(clubId: string): Promise<ClubAnalytics> {
  const admin = createAdminClient();

  // All tournaments for this club
  const { data: tournaments } = await admin
    .from('tournaments')
    .select('id, name, start_date, status')
    .eq('club_id', clubId)
    .order('start_date', { ascending: false });

  const tournamentRows = (tournaments ?? []) as Array<{ id: string; name: string; start_date: string; status: string }>;
  const activeTournaments = tournamentRows.filter((t) =>
    ['registration_open', 'in_progress'].includes(t.status),
  ).length;
  const completedTournaments = tournamentRows.filter((t) => t.status === 'completed').length;

  // Current member count
  const { count: totalMembers } = await admin
    .from('club_affiliations')
    .select('player_id', { count: 'exact', head: true })
    .eq('club_id', clubId)
    .eq('is_current', true);

  // Top members by rating (current only)
  const { data: affiliations } = await admin
    .from('club_affiliations')
    .select('player_id, players!player_id(full_name, username)')
    .eq('club_id', clubId)
    .eq('is_current', true);

  const affiliationRows = affiliations ?? [];
  const memberPlayerIds = affiliationRows.map((a) => a.player_id as string);

  // Batch-fetch global stats
  const { data: memberStats } = memberPlayerIds.length > 0
    ? await admin
        .from('global_stats')
        .select('player_id, current_rating, wins, losses')
        .in('player_id', memberPlayerIds)
    : { data: [] };
  const memberStatsMap = new Map<string, { current_rating: number; wins: number; losses: number }>(
    (memberStats ?? []).map((s) => [
      s.player_id as string,
      { current_rating: s.current_rating as number, wins: s.wins as number, losses: s.losses as number },
    ]),
  );

  const members: ClubTopMember[] = affiliationRows.map((a) => {
    const player = a.players as { full_name: string; username: string } | null;
    const stats = memberStatsMap.get(a.player_id as string);
    return {
      player_id: a.player_id as string,
      full_name: player?.full_name ?? 'Unknown',
      username: player?.username ?? 'unknown',
      current_rating: stats?.current_rating ?? 0,
      wins: stats?.wins ?? 0,
      losses: stats?.losses ?? 0,
    };
  }).sort((a, b) => b.current_rating - a.current_rating).slice(0, 5);

  const avgRating =
    members.length > 0
      ? Math.round((members.reduce((s, m) => s + m.current_rating, 0) / members.length) * 100) / 100
      : 0;

  return {
    totalMembers: totalMembers ?? 0,
    totalTournaments: tournamentRows.length,
    activeTournaments,
    completedTournaments,
    avgRating,
    topMembers: members,
    recentTournaments: tournamentRows.slice(0, 10),
  };
}

// ── Club Settings Update ──────────────────────────────────────────────────────

export interface UpdateClubInput {
  name: string;
  description: string | null;
  city: string | null;
  location: string | null;
  website: string | null;
  founding_year: number | null;
  is_open_to_join: boolean;
  brand_primary_color: string;
  brand_secondary_color: string;
}

export async function updateClubAction(clubId: string, clubSlug: string, input: UpdateClubInput) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const admin = createAdminClient();

  // Verify caller is owner
  const { data: myRole } = await admin
    .from('club_managers')
    .select('role')
    .eq('club_id', clubId)
    .eq('player_id', user.id)
    .maybeSingle();
  if (!myRole || myRole.role !== 'owner') return { error: 'Only club owners can edit settings.' };

  const { error } = await admin
    .from('clubs')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', clubId);

  if (error) return { error: error.message };
  revalidatePath(`/clubs/${clubSlug}`);
  revalidatePath(`/clubs/${clubSlug}/settings`);
  return { success: true };
}

// ── Club Logo Upload ──────────────────────────────────────────────────────────

export async function uploadClubLogoAction(clubId: string, clubSlug: string, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const admin = createAdminClient();

  // Verify owner
  const { data: myRole } = await admin
    .from('club_managers')
    .select('role')
    .eq('club_id', clubId)
    .eq('player_id', user.id)
    .maybeSingle();
  if (!myRole || myRole.role !== 'owner') return { error: 'Only club owners can upload a logo.' };

  const file = formData.get('logo') as File | null;
  if (!file || file.size === 0) return { error: 'No file provided' };
  if (file.size > 2 * 1024 * 1024) return { error: 'Logo must be under 2 MB' };
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'].includes(file.type)) {
    return { error: 'Only JPEG, PNG, WebP or SVG are accepted' };
  }

  const ext = file.name.split('.').pop() ?? 'png';
  const path = `${clubId}/logo.${ext}`;
  const { error: uploadErr } = await supabase.storage
    .from('club-logos')
    .upload(path, file, { upsert: true, contentType: file.type });
  if (uploadErr) return { error: 'Upload failed: ' + uploadErr.message };

  const { data: urlData } = supabase.storage.from('club-logos').getPublicUrl(path);

  const { error: updateErr } = await admin
    .from('clubs')
    .update({ logo_url: urlData.publicUrl })
    .eq('id', clubId);
  if (updateErr) return { error: updateErr.message };

  revalidatePath(`/clubs/${clubSlug}`);
  revalidatePath(`/clubs/${clubSlug}/settings`);
  return { success: true, logo_url: urlData.publicUrl };
}
