'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient, createClient, getCurrentUser } from '@/lib/supabase/server';
import { checkPermission } from '@/lib/permissions';
import { registerTeamSchema } from '@pickleball/shared';
import { sendTeamInviteNotification } from '@/lib/email/notifications';

// ── Register a team with a roster ─────────────────────────────────────────────

export async function registerTeamAction(categoryId: string, name: string, memberUsernames: string[]) {
  const parsed = registerTeamSchema.safeParse({ name, member_usernames: memberUsernames });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const user = await getCurrentUser();
  if (!user) return { error: 'You must be logged in to register.' };

  const admin = createAdminClient();

  const { data: cat } = await admin
    .from('tournament_categories')
    .select('id, tournament_id, status, max_entries, play_format, name, tournaments(id, slug, status, registration_deadline, auto_approve_entries, name)')
    .eq('id', categoryId)
    .single();

  if (!cat) return { error: 'Category not found.' };

  const tournament = cat.tournaments as {
    id: string; slug: string; status: string;
    registration_deadline: string | null; auto_approve_entries: boolean; name: string;
  } | null;

  if (!tournament) return { error: 'Tournament not found.' };
  if (tournament.status !== 'registration_open') return { error: 'Tournament is not accepting registrations.' };
  if (cat.status !== 'registration') return { error: 'This category is not open for registration.' };
  if (tournament.registration_deadline && new Date() > new Date(tournament.registration_deadline)) {
    return { error: 'Registration deadline has passed.' };
  }
  if (cat.play_format !== 'team_event') return { error: 'This action is only for team event categories.' };

  // Resolve member usernames to players, excluding the captain and duplicates
  const cleanedUsernames = [...new Set(parsed.data.member_usernames.map((u) => u.toLowerCase().replace(/^@/, '')))];

  const { data: members } = await admin
    .from('players')
    .select('id, full_name, email, username')
    .in('username', cleanedUsernames);

  const found = members ?? [];
  const foundUsernames = new Set(found.map((m) => m.username));
  const missing = cleanedUsernames.filter((u) => !foundUsernames.has(u));
  if (missing.length > 0) return { error: `Player(s) not found: ${missing.map((u) => `@${u}`).join(', ')}` };
  if (found.some((m) => m.id === user.id)) return { error: "You can't add yourself as a roster member — you're the captain." };

  // Capacity check (teams, not players) — active + pending count toward capacity
  const { count: activeCount } = await admin
    .from('tournament_teams')
    .select('id', { count: 'exact', head: true })
    .eq('category_id', categoryId)
    .in('status', ['active', 'pending', 'waitlisted']);

  const isFull = cat.max_entries !== null && (activeCount ?? 0) >= cat.max_entries;

  const { data: team, error: teamErr } = await admin
    .from('tournament_teams')
    .insert({
      tournament_id: tournament.id,
      category_id: categoryId,
      name: parsed.data.name,
      captain_id: user.id,
      status: isFull ? 'waitlisted' : (tournament.auto_approve_entries ? 'active' : 'pending'),
    })
    .select('id')
    .single();

  if (teamErr || !team) return { error: 'Failed to create team. Please try again.' };

  const { error: membersErr } = await admin
    .from('team_members')
    .insert(found.map((m) => ({ team_id: team.id, player_id: m.id, status: 'provisional' as const })));

  if (membersErr) {
    await admin.from('tournament_teams').delete().eq('id', team.id);
    return { error: 'Failed to invite roster members. Please try again.' };
  }

  const { data: captain } = await admin.from('players').select('full_name').eq('id', user.id).single();

  for (const member of found) {
    void sendTeamInviteNotification({
      memberEmail: member.email,
      memberName: member.full_name,
      captainName: captain?.full_name ?? 'A player',
      teamName: parsed.data.name,
      tournamentName: tournament.name,
      categoryName: cat.name,
    });
  }

  revalidatePath(`/events/${tournament.slug}`);
  revalidatePath('/dashboard');
  return { success: true, teamId: team.id, willBeWaitlisted: isFull };
}

// ── Roster member confirm / decline ───────────────────────────────────────────

export async function confirmTeamInviteAction(memberId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: 'You must be logged in.' };

  const admin = createAdminClient();

  const { data: member } = await admin
    .from('team_members')
    .select('id, player_id, status, team_id, tournament_teams!team_id(id, tournament_id, tournaments!tournament_id(slug))')
    .eq('id', memberId)
    .single();

  if (!member) return { error: 'Invite not found.' };
  if (member.player_id !== user.id) return { error: 'This invite is not for you.' };
  if (member.status !== 'provisional') return { error: 'Invite is no longer pending.' };

  const team = member.tournament_teams as unknown as { id: string; tournament_id: string; tournaments: { slug: string } | null } | null;
  const tSlug = team?.tournaments?.slug ?? team?.tournament_id;

  await admin.from('team_members').update({ status: 'active', responded_at: new Date().toISOString() }).eq('id', memberId);

  revalidatePath(`/events/${tSlug}`);
  revalidatePath('/dashboard');
  return { success: true };
}

export async function declineTeamInviteAction(memberId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: 'You must be logged in.' };

  const admin = createAdminClient();

  const { data: member } = await admin
    .from('team_members')
    .select('id, player_id, status, team_id, tournament_teams!team_id(id, tournament_id, tournaments!tournament_id(slug))')
    .eq('id', memberId)
    .single();

  if (!member) return { error: 'Invite not found.' };
  if (member.player_id !== user.id) return { error: 'This invite is not for you.' };
  if (member.status !== 'provisional') return { error: 'Invite is no longer pending.' };

  const team = member.tournament_teams as unknown as { id: string; tournament_id: string; tournaments: { slug: string } | null } | null;
  const tSlug = team?.tournaments?.slug ?? team?.tournament_id;

  await admin.from('team_members').update({ status: 'withdrawn', responded_at: new Date().toISOString() }).eq('id', memberId);

  revalidatePath(`/events/${tSlug}`);
  revalidatePath('/dashboard');
  return { success: true };
}

export async function getMyTeamInvitesAction() {
  const user = await getCurrentUser();
  if (!user) return [];

  const admin = createAdminClient();
  const { data } = await admin
    .from('team_members')
    .select(`
      id, status, invited_at,
      tournament_teams!team_id(
        id, name,
        captain:players!captain_id(full_name, username),
        tournament_categories!category_id(id, name),
        tournaments!tournament_id(id, name, slug, start_date)
      )
    `)
    .eq('player_id', user.id)
    .eq('status', 'provisional')
    .order('invited_at', { ascending: false });

  return data ?? [];
}

// ── Withdraw a team (captain only) ────────────────────────────────────────────

export async function withdrawTeamAction(teamId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: 'Not authenticated.' };

  const admin = createAdminClient();

  const { data: team } = await admin
    .from('tournament_teams')
    .select('id, captain_id, status, tournament_id, tournaments!tournament_id(slug, club_id)')
    .eq('id', teamId)
    .single();

  if (!team || team.captain_id !== user.id) return { error: 'Team not found.' };
  if (team.status === 'withdrawn') return { error: 'Already withdrawn.' };

  const t = team.tournaments as { slug: string; club_id: string } | null;
  const allowed = await checkPermission('player', 'entries', 'withdraw', t?.club_id);
  if (!allowed) return { error: 'Withdrawals are not permitted at this time.' };

  const tSlug = t?.slug ?? team.tournament_id;

  await admin.from('tournament_teams').update({ status: 'withdrawn' }).eq('id', teamId);

  revalidatePath(`/events/${tSlug}`);
  revalidatePath(`/tournaments/${tSlug}`);
  revalidatePath('/dashboard');
  return { success: true };
}

// ── Lineup submission (visible/sequential — second captain can see the first's) ─

interface LineupSlot {
  rubber_sequence: number;
  player_id: string;
  partner_id?: string;
}

export async function submitTieLineupAction(tieId: string, lineup: LineupSlot[]) {
  const user = await getCurrentUser();
  if (!user) return { error: 'Not authenticated.' };

  const admin = createAdminClient();

  const { data: tie } = await admin
    .from('ties')
    .select('id, category_id, tournament_id, team_a_id, team_b_id, lineup_a_submitted_at, lineup_b_submitted_at')
    .eq('id', tieId)
    .single();

  if (!tie || !tie.team_a_id || !tie.team_b_id) return { error: 'Tie not found.' };

  const { data: teamA } = await admin.from('tournament_teams').select('id, captain_id').eq('id', tie.team_a_id).single();
  const { data: teamB } = await admin.from('tournament_teams').select('id, captain_id').eq('id', tie.team_b_id).single();

  let side: 'a' | 'b';
  let captainTeam: { id: string; captain_id: string };
  if (teamA?.captain_id === user.id) { side = 'a'; captainTeam = teamA; }
  else if (teamB?.captain_id === user.id) { side = 'b'; captainTeam = teamB; }
  else return { error: 'Only a team captain can submit a lineup for this tie.' };

  if (side === 'a' && tie.lineup_a_submitted_at) return { error: 'Your lineup is already locked in for this tie.' };
  if (side === 'b' && tie.lineup_b_submitted_at) return { error: 'Your lineup is already locked in for this tie.' };

  const { data: category } = await admin
    .from('tournament_categories')
    .select('rubber_lineup')
    .eq('id', tie.category_id)
    .single();

  const rubberLineup = (category?.rubber_lineup ?? []) as { sequence: number; play_format: string }[];
  const lineupBySeq = new Map(lineup.map((l) => [l.rubber_sequence, l]));

  for (const rubber of rubberLineup) {
    const slot = lineupBySeq.get(rubber.sequence);
    if (!slot) return { error: `Missing lineup for rubber ${rubber.sequence}.` };
    const needsPartner = rubber.play_format === 'doubles' || rubber.play_format === 'mixed_doubles';
    if (needsPartner && !slot.partner_id) return { error: `Rubber ${rubber.sequence} (${rubber.play_format}) requires two players.` };
    if (!needsPartner && slot.partner_id) return { error: `Rubber ${rubber.sequence} (singles) only takes one player.` };

    const { data: confirmedMember } = await admin
      .from('team_members')
      .select('id')
      .eq('team_id', captainTeam.id)
      .eq('player_id', slot.player_id)
      .eq('status', 'active')
      .maybeSingle();
    const isCaptainPlaying = slot.player_id === captainTeam.captain_id;
    if (!confirmedMember && !isCaptainPlaying) return { error: `Player in rubber ${rubber.sequence} is not a confirmed roster member.` };

    if (slot.partner_id) {
      const { data: confirmedPartner } = await admin
        .from('team_members')
        .select('id')
        .eq('team_id', captainTeam.id)
        .eq('player_id', slot.partner_id)
        .eq('status', 'active')
        .maybeSingle();
      const isCaptainPartner = slot.partner_id === captainTeam.captain_id;
      if (!confirmedPartner && !isCaptainPartner) return { error: `Partner in rubber ${rubber.sequence} is not a confirmed roster member.` };
    }

    const { data: entry, error: entryErr } = await admin
      .from('tournament_entries')
      .insert({
        tournament_id: tie.tournament_id,
        category_id: tie.category_id,
        player_id: slot.player_id,
        partner_id: slot.partner_id ?? null,
        team_id: captainTeam.id,
        status: 'active',
      })
      .select('id')
      .single();

    if (entryErr || !entry) return { error: `Failed to register lineup for rubber ${rubber.sequence}.` };

    const entryColumn = side === 'a' ? 'entry_a_id' : 'entry_b_id';
    await admin
      .from('matches')
      .update({ [entryColumn]: entry.id })
      .eq('tie_id', tieId)
      .eq('rubber_sequence', rubber.sequence);
  }

  const lockField = side === 'a' ? 'lineup_a_submitted_at' : 'lineup_b_submitted_at';
  const otherLocked = side === 'a' ? tie.lineup_b_submitted_at : tie.lineup_a_submitted_at;
  await admin
    .from('ties')
    .update({
      [lockField]: new Date().toISOString(),
      ...(otherLocked && { status: 'scheduled' }),
    })
    .eq('id', tieId);

  return { success: true };
}
