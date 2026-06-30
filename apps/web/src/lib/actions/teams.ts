'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient, createClient, getCurrentUser } from '@/lib/supabase/server';
import { checkPermission } from '@/lib/permissions';
import { registerTeamSchema, type RosterCompositionRule } from '@pickleball/shared';
import { sendTeamInviteNotification } from '@/lib/email/notifications';
import { checkAndAdvanceTie } from './scoring';
import { detectConflictsFromUpdates, resolveCategoryDurationMins, type ScheduleUpdate } from '@/lib/scheduling-utils';

// ── Roster composition: soft warning only, never blocks registration ─────────
function playerAge(dob: string | null): number | null {
  if (!dob) return null;
  const diff = Date.now() - new Date(dob).getTime();
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
}

function checkRosterComposition(
  rules: RosterCompositionRule[],
  roster: { gender: string; dob: string | null }[],
): string | null {
  if (!rules || rules.length === 0) return null;
  const shortfalls: string[] = [];
  for (const rule of rules) {
    const matching = roster.filter((p) => {
      if (rule.gender && p.gender !== rule.gender) return false;
      const age = playerAge(p.dob);
      if (rule.age_min !== undefined && (age === null || age < rule.age_min)) return false;
      if (rule.age_max !== undefined && (age === null || age > rule.age_max)) return false;
      return true;
    });
    if (matching.length < rule.count) {
      const desc = [
        rule.gender ? (rule.gender === 'male' ? 'men' : 'women') : 'players',
        rule.age_min !== undefined ? `${rule.age_min}+` : '',
        rule.age_max !== undefined ? `under ${rule.age_max}` : '',
      ].filter(Boolean).join(' ');
      shortfalls.push(`needs ${rule.count} ${desc} (has ${matching.length})`);
    }
  }
  if (shortfalls.length === 0) return null;
  return `Roster doesn't meet the category's composition rule: ${shortfalls.join('; ')}.`;
}

// ── Verify the calling user manages the tournament's club ──────────────────
async function assertTournamentManager(tournamentId: string, userId: string) {
  const admin = createAdminClient();
  const { data: t } = await admin
    .from('tournaments')
    .select('club_id, slug')
    .eq('id', tournamentId)
    .single();
  if (!t) return null;

  const { data: mgr } = await admin
    .from('club_managers')
    .select('role')
    .eq('club_id', t.club_id)
    .eq('player_id', userId)
    .maybeSingle();

  return mgr ? t : null;
}

// ── A player can only be on one team per tournament (not just per category) ──
async function findPlayersAlreadyOnATeam(
  admin: ReturnType<typeof createAdminClient>,
  tournamentId: string,
  playerIds: string[],
): Promise<string[]> {
  if (playerIds.length === 0) return [];

  const { data: captainTeams } = await admin
    .from('tournament_teams')
    .select('captain_id')
    .eq('tournament_id', tournamentId)
    .neq('status', 'withdrawn')
    .in('captain_id', playerIds);

  const { data: memberRows } = await admin
    .from('team_members')
    .select('player_id, tournament_teams!inner(tournament_id, status)')
    .in('player_id', playerIds)
    .in('status', ['active', 'provisional'])
    .eq('tournament_teams.tournament_id', tournamentId)
    .neq('tournament_teams.status', 'withdrawn');

  return [...new Set([
    ...(captainTeams ?? []).map((t) => t.captain_id),
    ...(memberRows ?? []).map((m) => m.player_id),
  ])];
}

// ── Organizer: add a team directly (no invite/confirm flow) ──────────────────
// Mirrors addPlayerByEmailAction's organizer-add pattern — looks players up by
// email and adds them immediately as 'active', bypassing the captain-invite flow.
export async function addTeamByOrganizerAction(
  tournamentId: string,
  categoryId: string,
  teamName: string,
  memberEmails: string[],
  captainEmail: string,
  marqueeEmail?: string,
  ownerName?: string,
) {
  const user = await getCurrentUser();
  if (!user) return { error: 'Not authenticated' };

  const t = await assertTournamentManager(tournamentId, user.id);
  if (!t) return { error: 'Permission denied' };

  if (!teamName.trim()) return { error: 'Enter a team name' };

  const admin = createAdminClient();

  const { data: cat } = await admin
    .from('tournament_categories')
    .select('id, play_format, roster_composition')
    .eq('id', categoryId)
    .single();
  if (!cat || cat.play_format !== 'team_event') return { error: 'This action is only for team event categories' };

  const cleanedMemberEmails = [...new Set(memberEmails.map((e) => e.toLowerCase().trim()).filter(Boolean))];
  const normCaptainEmail = captainEmail.toLowerCase().trim();
  if (!normCaptainEmail) return { error: 'Choose a captain from the roster' };
  if (!cleanedMemberEmails.includes(normCaptainEmail)) {
    return { error: 'The captain must be one of the roster members listed below' };
  }

  const { data: members } = await admin
    .from('players')
    .select('id, email, gender, dob')
    .in('email', cleanedMemberEmails);

  const found = members ?? [];
  const foundEmails = new Set(found.map((m) => m.email.toLowerCase()));
  const missing = cleanedMemberEmails.filter((e) => !foundEmails.has(e));
  if (missing.length > 0) return { error: `No PLAYOFFE account found for: ${missing.join(', ')}` };

  const captain = found.find((m) => m.email.toLowerCase() === normCaptainEmail)!;

  const conflicting = await findPlayersAlreadyOnATeam(admin, tournamentId, found.map((m) => m.id));
  if (conflicting.length > 0) {
    return { error: 'One or more players are already on a team in this tournament. A player can only be on one team per tournament.' };
  }

  let marqueePlayerId: string | null = null;
  if (marqueeEmail?.trim()) {
    const normMarquee = marqueeEmail.toLowerCase().trim();
    const marqueeMember = found.find((m) => m.email.toLowerCase() === normMarquee);
    if (!marqueeMember) return { error: 'Marquee player must be a roster member' };
    marqueePlayerId = marqueeMember.id;
  }

  const { data: team, error: teamErr } = await admin
    .from('tournament_teams')
    .insert({
      tournament_id: tournamentId,
      category_id: categoryId,
      name: teamName.trim(),
      captain_id: captain.id,
      marquee_player_id: marqueePlayerId,
      owner_name: ownerName?.trim() || null,
      status: 'active',
    })
    .select('id')
    .single();

  if (teamErr || !team) return { error: 'Failed to create team' };

  const { error: membersErr } = await admin
    .from('team_members')
    .insert(found.map((m) => ({ team_id: team.id, player_id: m.id, status: 'active' as const })));
  if (membersErr) {
    await admin.from('tournament_teams').delete().eq('id', team.id);
    return { error: 'Failed to add roster members' };
  }

  const warning = checkRosterComposition(
    (cat.roster_composition ?? []) as unknown as RosterCompositionRule[],
    found,
  );

  revalidatePath(`/tournaments/${t.slug}/categories/${categoryId}`);
  return { success: true, teamId: team.id, warning };
}

// ── Organizer: reassign a team's captain ──────────────────────────────────────
// The new captain must already be on the roster (active team_members row) or
// be the existing captain being swapped for someone already on the roster.
export async function reassignTeamCaptainAction(teamId: string, newCaptainId: string, tournamentId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: 'Not authenticated' };

  const t = await assertTournamentManager(tournamentId, user.id);
  if (!t) return { error: 'Permission denied' };

  const admin = createAdminClient();

  const { data: team } = await admin.from('tournament_teams').select('id, captain_id').eq('id', teamId).single();
  if (!team) return { error: 'Team not found' };
  if (team.captain_id === newCaptainId) return { success: true };

  const { data: member } = await admin
    .from('team_members')
    .select('id')
    .eq('team_id', teamId)
    .eq('player_id', newCaptainId)
    .eq('status', 'active')
    .maybeSingle();
  if (!member) return { error: 'New captain must be an active roster member' };

  const { error } = await admin.from('tournament_teams').update({ captain_id: newCaptainId }).eq('id', teamId);
  if (error) return { error: 'Failed to reassign captain' };

  revalidatePath(`/tournaments/${t.slug}`);
  return { success: true };
}

// ── Walk over an entire tie to one team ───────────────────────────────────────
// Shared core for the organizer-initiated walkoverTieAction and the automatic
// cascade that runs when a team withdraws after the draw is generated. Marks
// every not-yet-finished rubber 'walkover' and the tie 'completed' in one go.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function applyTieWalkover(admin: any, tieId: string, winningTeamId: string) {
  const { data: tie } = await admin
    .from('ties')
    .select('id, category_id, team_a_id, team_b_id, status')
    .eq('id', tieId)
    .single();
  if (!tie) return { error: 'Tie not found' };
  if (winningTeamId !== tie.team_a_id && winningTeamId !== tie.team_b_id) {
    return { error: 'Winning team must be one of the two teams in this tie' };
  }
  if (tie.status === 'completed') return { error: 'Tie is already completed' };

  await admin
    .from('matches')
    .update({ status: 'walkover' })
    .eq('tie_id', tieId)
    .not('status', 'in', '("completed","walkover")');

  const { data: cat } = await admin.from('tournament_categories').select('rubber_lineup').eq('id', tie.category_id).single();
  const totalRubbers = ((cat?.rubber_lineup ?? []) as unknown[]).length;
  const winnerIsA = winningTeamId === tie.team_a_id;

  await admin.from('ties').update({
    status: 'completed',
    completed_at: new Date().toISOString(),
    winner_team_id: winningTeamId,
    rubbers_won_a: winnerIsA ? totalRubbers : 0,
    rubbers_won_b: winnerIsA ? 0 : totalRubbers,
  }).eq('id', tieId);

  await checkAndAdvanceTie(admin, tieId);
  return { success: true };
}

// ── Organizer: walk over an entire tie to one team ────────────────────────────
export async function walkoverTieAction(tieId: string, winningTeamId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: 'Not authenticated' };

  const admin = createAdminClient();

  const { data: tie } = await admin.from('ties').select('tournament_id').eq('id', tieId).single();
  if (!tie) return { error: 'Tie not found' };

  const t = await assertTournamentManager(tie.tournament_id, user.id);
  if (!t) return { error: 'Permission denied' };

  const result = await applyTieWalkover(admin, tieId, winningTeamId);
  if ('error' in result) return result;

  revalidatePath(`/tournaments/${t.slug}`);
  return { success: true };
}

// ── Organizer: schedule a tie's rubbers as one atomic same-court unit ────────
// A tie's rubbers always run on the same court, back-to-back, in the
// organizer-configured rubber order. Rather than letting the general
// match-by-match Gantt/AI scheduler (built for singles/doubles, one match per
// slot) reach into ties, this is a dedicated action: pick a court + start
// time for the tie, and every rubber gets sequential back-to-back slots on
// that court automatically — the rubbers are never independently movable.
export async function scheduleTieAction(tieId: string, court: number, startTimeIso: string) {
  const user = await getCurrentUser();
  if (!user) return { error: 'Not authenticated' };

  const admin = createAdminClient();

  const { data: tie } = await admin
    .from('ties')
    .select('id, tournament_id, category_id')
    .eq('id', tieId)
    .single();
  if (!tie) return { error: 'Tie not found' };

  const t = await assertTournamentManager(tie.tournament_id, user.id);
  if (!t) return { error: 'Permission denied' };

  const { data: tournament } = await admin
    .from('tournaments')
    .select('court_count, scoring_format, num_sets')
    .eq('id', tie.tournament_id)
    .single();
  if (!tournament) return { error: 'Tournament not found' };
  if (court < 1 || court > tournament.court_count) return { error: `Court must be between 1 and ${tournament.court_count}` };

  const { data: category } = await admin
    .from('tournament_categories')
    .select('scoring_override, scoring_format, num_sets')
    .eq('id', tie.category_id)
    .single();

  const durationMins = resolveCategoryDurationMins(
    category,
    { scoringFormat: (tournament.scoring_format ?? 'rally') as 'rally' | 'traditional', numSets: tournament.num_sets ?? 1 },
    5,
  );

  const { data: rubberMatches } = await admin
    .from('matches')
    .select('id, rubber_sequence, is_decider, status')
    .eq('tie_id', tieId)
    .order('is_decider', { ascending: true })
    .order('rubber_sequence', { ascending: true });

  const schedulable = (rubberMatches ?? []).filter((m) => m.status === 'scheduled');
  if (schedulable.length === 0) return { error: 'No schedulable rubbers found for this tie' };

  const updates: ScheduleUpdate[] = schedulable.map((m, i) => ({
    matchId: m.id,
    scheduledTime: new Date(new Date(startTimeIso).getTime() + i * durationMins * 60_000).toISOString(),
    court,
  }));

  // Check against every other already-scheduled match in the tournament on
  // this court (excluding this tie's own rubbers, which we're about to move).
  const { data: otherOnCourt } = await admin
    .from('matches')
    .select('id, scheduled_time, court')
    .eq('tournament_id', tie.tournament_id)
    .eq('court', court)
    .not('scheduled_time', 'is', null)
    .not('tie_id', 'eq', tieId);

  const existingUpdates: ScheduleUpdate[] = (otherOnCourt ?? []).map((m) => ({
    matchId: m.id, scheduledTime: m.scheduled_time, court: m.court,
  }));

  const conflicts = detectConflictsFromUpdates([...existingUpdates, ...updates], durationMins);
  const newConflicts = conflicts.filter((c) => updates.some((u) => u.matchId === c.matchId));
  if (newConflicts.length > 0) {
    return { error: `Scheduling conflict on court ${court}: ${newConflicts[0].message}` };
  }

  await Promise.all(
    updates.map((u) => admin.from('matches').update({ scheduled_time: u.scheduledTime, court: u.court }).eq('id', u.matchId)),
  );

  revalidatePath(`/tournaments/${t.slug}`);
  return { success: true, scheduled: updates.length };
}

// ── Organizer: remove a team ──────────────────────────────────────────────────
export async function removeTeamAction(teamId: string, tournamentId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: 'Not authenticated' };

  const t = await assertTournamentManager(tournamentId, user.id);
  if (!t) return { error: 'Permission denied' };

  const admin = createAdminClient();
  await admin.from('tournament_teams').delete().eq('id', teamId);

  revalidatePath(`/tournaments/${t.slug}`);
  return { success: true };
}

// ── Fetch teams + rosters for a category (organizer display) ─────────────────
export async function getTeamsForCategoryAction(categoryId: string) {
  const admin = createAdminClient();

  const { data: cat } = await admin
    .from('tournament_categories')
    .select('roster_composition')
    .eq('id', categoryId)
    .single();
  const rules = (cat?.roster_composition ?? []) as unknown as RosterCompositionRule[];

  const { data: teams } = await admin
    .from('tournament_teams')
    .select(`
      id, name, seed, status, registered_at, owner_name, default_lineup, default_lineup_enabled,
      captain:players!captain_id(id, full_name, username, gender, dob),
      marquee:players!marquee_player_id(id, full_name, username),
      team_members(id, status, player:players!player_id(id, full_name, username, gender, dob))
    `)
    .eq('category_id', categoryId)
    .neq('status', 'withdrawn')
    .order('registered_at', { ascending: true });

  return (teams ?? []).map((team) => {
    const roster = [
      ...(team.captain ? [team.captain] : []),
      ...team.team_members.filter((m) => m.status === 'active' && m.player).map((m) => m.player!),
    ];
    return {
      ...team,
      composition_warning: checkRosterComposition(rules, roster),
      default_lineup: (team.default_lineup ?? []) as unknown as LineupSlot[],
    };
  });
}

// ── Register a team with a roster ─────────────────────────────────────────────

export async function registerTeamAction(categoryId: string, name: string, memberUsernames: string[]) {
  const parsed = registerTeamSchema.safeParse({ name, member_usernames: memberUsernames });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const user = await getCurrentUser();
  if (!user) return { error: 'You must be logged in to register.' };

  const admin = createAdminClient();

  const { data: cat } = await admin
    .from('tournament_categories')
    .select('id, tournament_id, status, max_entries, play_format, name, roster_composition, tournaments(id, slug, status, registration_deadline, auto_approve_entries, name)')
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
    .select('id, full_name, email, username, gender, dob')
    .in('username', cleanedUsernames);

  const found = members ?? [];
  const foundUsernames = new Set(found.map((m) => m.username));
  const missing = cleanedUsernames.filter((u) => !foundUsernames.has(u));
  if (missing.length > 0) return { error: `Player(s) not found: ${missing.map((u) => `@${u}`).join(', ')}` };
  if (found.some((m) => m.id === user.id)) return { error: "You can't add yourself as a roster member — you're the captain." };

  const conflicting = await findPlayersAlreadyOnATeam(admin, cat.tournament_id, [user.id, ...found.map((m) => m.id)]);
  if (conflicting.length > 0) {
    return { error: 'You or one of the invited players is already on a team in this tournament. A player can only be on one team per tournament.' };
  }

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

  const { data: captain } = await admin.from('players').select('full_name, gender, dob').eq('id', user.id).single();

  const warning = checkRosterComposition(
    (cat.roster_composition ?? []) as unknown as RosterCompositionRule[],
    captain ? [captain, ...found] : found,
  );

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
  return { success: true, teamId: team.id, willBeWaitlisted: isFull, warning };
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

  if (team) {
    const conflicting = await findPlayersAlreadyOnATeam(admin, team.tournament_id, [user.id]);
    if (conflicting.length > 0) {
      return { error: "You're already on another team in this tournament — you can only be on one team per tournament." };
    }
  }

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

  // If the draw has already been generated, this team's remaining ties walk
  // over to the opponent automatically (no replacement-team mechanism for
  // teams, unlike the entry-replacement flow for singles/doubles).
  const { data: pendingTies } = await admin
    .from('ties')
    .select('id, team_a_id, team_b_id')
    .or(`team_a_id.eq.${teamId},team_b_id.eq.${teamId}`)
    .not('status', 'eq', 'completed');

  for (const tie of pendingTies ?? []) {
    const opponentId = tie.team_a_id === teamId ? tie.team_b_id : tie.team_a_id;
    if (opponentId) await applyTieWalkover(admin, tie.id, opponentId);
  }

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function applySideLineup(
  admin: any,
  tie: { id: string; category_id: string; tournament_id: string; lineup_a_submitted_at: string | null; lineup_b_submitted_at: string | null },
  side: 'a' | 'b',
  captainTeam: { id: string; captain_id: string },
  lineup: LineupSlot[],
): Promise<{ error: string } | { success: true }> {
  // Per-rubber lock: editable any time for any rubber whose match hasn't
  // started yet ('scheduled' status). Once a rubber's match leaves
  // 'scheduled' (in_progress/completed/walkover), that rubber's assignment
  // is frozen — but other not-yet-started rubbers in the same tie remain
  // editable. No whole-tie lock.
  const { data: category } = await admin
    .from('tournament_categories')
    .select('rubber_lineup')
    .eq('id', tie.category_id)
    .single();

  const rubberLineup = (category?.rubber_lineup ?? []) as { sequence: number; name: string; play_format: string }[];
  const lineupBySeq = new Map(lineup.map((l) => [l.rubber_sequence, l]));
  const entryColumn = side === 'a' ? 'entry_a_id' : 'entry_b_id';

  const { data: rubberMatches } = await admin
    .from('matches')
    .select('id, rubber_sequence, status, entry_a_id, entry_b_id')
    .eq('tie_id', tie.id)
    .eq('is_decider', false);

  const matchBySeq = new Map((rubberMatches ?? []).map((m: { rubber_sequence: number }) => [m.rubber_sequence, m]));

  for (const rubber of rubberLineup) {
    const label = rubber.name || `Rubber ${rubber.sequence}`;
    const match = matchBySeq.get(rubber.sequence) as { id: string; status: string; entry_a_id: string | null; entry_b_id: string | null } | undefined;
    if (!match) continue;
    if (match.status !== 'scheduled') continue; // already started/completed — frozen, silently skip

    const slot = lineupBySeq.get(rubber.sequence);
    if (!slot) return { error: `Missing lineup for ${label}.` };
    const needsPartner = rubber.play_format === 'doubles' || rubber.play_format === 'mixed_doubles';
    if (needsPartner && !slot.partner_id) return { error: `${label} (${rubber.play_format}) requires two players.` };
    if (!needsPartner && slot.partner_id) return { error: `${label} (singles) only takes one player.` };

    const { data: confirmedMember } = await admin
      .from('team_members')
      .select('id')
      .eq('team_id', captainTeam.id)
      .eq('player_id', slot.player_id)
      .eq('status', 'active')
      .maybeSingle();
    const isCaptainPlaying = slot.player_id === captainTeam.captain_id;
    if (!confirmedMember && !isCaptainPlaying) return { error: `Player in ${label} is not a confirmed roster member.` };

    if (slot.partner_id) {
      const { data: confirmedPartner } = await admin
        .from('team_members')
        .select('id')
        .eq('team_id', captainTeam.id)
        .eq('player_id', slot.partner_id)
        .eq('status', 'active')
        .maybeSingle();
      const isCaptainPartner = slot.partner_id === captainTeam.captain_id;
      if (!confirmedPartner && !isCaptainPartner) return { error: `Partner in ${label} is not a confirmed roster member.` };
    }

    const existingEntryId = side === 'a' ? match.entry_a_id : match.entry_b_id;

    if (existingEntryId) {
      // Editing a previously submitted slot — update the existing entry in place.
      const { error: updateErr } = await admin
        .from('tournament_entries')
        .update({ player_id: slot.player_id, partner_id: slot.partner_id ?? null })
        .eq('id', existingEntryId);
      if (updateErr) return { error: `Failed to update lineup for ${label}.` };
    } else {
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

      if (entryErr || !entry) return { error: `Failed to register lineup for ${label}.` };

      await admin
        .from('matches')
        .update({ [entryColumn]: entry.id })
        .eq('id', match.id);
    }
  }

  const lockField = side === 'a' ? 'lineup_a_submitted_at' : 'lineup_b_submitted_at';
  const alreadySubmitted = side === 'a' ? tie.lineup_a_submitted_at : tie.lineup_b_submitted_at;
  const otherSubmitted = side === 'a' ? tie.lineup_b_submitted_at : tie.lineup_a_submitted_at;
  await admin
    .from('ties')
    .update({
      ...(!alreadySubmitted && { [lockField]: new Date().toISOString() }),
      ...(otherSubmitted && { status: 'scheduled' }),
    })
    .eq('id', tie.id);

  return { success: true };
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

  return applySideLineup(admin, tie, side, captainTeam, lineup);
}

// ── Organizer/manager: submit a lineup on behalf of either (or both) teams ──
// For when a captain isn't available to submit through their own account —
// the organizer already manages the roster from this page, so let them fill
// in the lineup directly instead of blocking the tie from being scheduled.
export async function submitTieLineupAsManagerAction(
  tieId: string,
  lineupA: LineupSlot[],
  lineupB: LineupSlot[],
): Promise<{ error: string } | { success: true }> {
  const user = await getCurrentUser();
  if (!user) return { error: 'Not authenticated.' };

  const admin = createAdminClient();

  const { data: tie } = await admin
    .from('ties')
    .select('id, category_id, tournament_id, team_a_id, team_b_id, lineup_a_submitted_at, lineup_b_submitted_at')
    .eq('id', tieId)
    .single();
  if (!tie || !tie.team_a_id || !tie.team_b_id) return { error: 'Tie not found.' };

  const t = await assertTournamentManager(tie.tournament_id, user.id);
  if (!t) return { error: 'Permission denied' };

  const { data: teamA } = await admin.from('tournament_teams').select('id, captain_id').eq('id', tie.team_a_id).single();
  const { data: teamB } = await admin.from('tournament_teams').select('id, captain_id').eq('id', tie.team_b_id).single();
  if (!teamA || !teamB) return { error: 'Teams not found.' };

  if (lineupA.length > 0) {
    const result = await applySideLineup(admin, tie, 'a', teamA, lineupA);
    if ('error' in result) return result;
  }
  if (lineupB.length > 0) {
    const result = await applySideLineup(admin, tie, 'b', teamB, lineupB);
    if ('error' in result) return result;
  }

  revalidatePath(`/tournaments/${t.slug}/registrations`);
  return { success: true };
}

// ── Team default lineup (one player/pair per rubber, reused across ties) ────
// Set from the Registrations page so the organizer doesn't have to re-enter
// the same lineup for every tie. When enabled, this is auto-applied to every
// not-yet-started rubber the team plays — both immediately (existing ties)
// and going forward, via fillTeamDefaultLineupForTie being called whenever a
// new tie is created (draw generation, group-stage promotion).
export async function setTeamDefaultLineupAction(
  teamId: string,
  lineup: LineupSlot[],
  applyToAll: boolean,
): Promise<{ error: string } | { success: true }> {
  const user = await getCurrentUser();
  if (!user) return { error: 'Not authenticated.' };

  const admin = createAdminClient();

  const { data: team } = await admin
    .from('tournament_teams')
    .select('id, tournament_id, category_id, captain_id')
    .eq('id', teamId)
    .single();
  if (!team) return { error: 'Team not found.' };

  const t = await assertTournamentManager(team.tournament_id, user.id);
  if (!t) return { error: 'Permission denied' };

  const { data: cat } = await admin
    .from('tournament_categories')
    .select('rubber_lineup')
    .eq('id', team.category_id)
    .single();
  const rubberLineup = (cat?.rubber_lineup ?? []) as { sequence: number; name: string; play_format: string }[];

  // A default lineup must cover every rubber — a partial default would leave
  // some rubbers silently unfilled when applied to a new tie.
  const lineupBySeq = new Map(lineup.map((l) => [l.rubber_sequence, l]));
  for (const rubber of rubberLineup) {
    const label = rubber.name || `Rubber ${rubber.sequence}`;
    const slot = lineupBySeq.get(rubber.sequence);
    if (!slot || !slot.player_id) return { error: `Missing default player for ${label}.` };
    const needsPartner = rubber.play_format === 'doubles' || rubber.play_format === 'mixed_doubles';
    if (needsPartner && !slot.partner_id) return { error: `${label} (${rubber.play_format}) requires two players.` };
    if (!needsPartner && slot.partner_id) return { error: `${label} (singles) only takes one player.` };
  }

  // Validate every named player is on this team's confirmed roster.
  const captainId = team.captain_id;
  async function isRosterMember(playerId: string) {
    if (playerId === captainId) return true;
    const { data } = await admin
      .from('team_members')
      .select('id')
      .eq('team_id', teamId)
      .eq('player_id', playerId)
      .eq('status', 'active')
      .maybeSingle();
    return !!data;
  }
  for (const slot of lineup) {
    if (!(await isRosterMember(slot.player_id))) return { error: 'A selected player is not on this team\'s roster.' };
    if (slot.partner_id && !(await isRosterMember(slot.partner_id))) return { error: 'A selected partner is not on this team\'s roster.' };
  }

  const { error: saveErr } = await admin
    .from('tournament_teams')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({ default_lineup: lineup as any, default_lineup_enabled: applyToAll })
    .eq('id', teamId);
  if (saveErr) return { error: 'Failed to save default lineup.' };

  if (applyToAll) {
    const { data: ties } = await admin
      .from('ties')
      .select('id')
      .or(`team_a_id.eq.${teamId},team_b_id.eq.${teamId}`);
    for (const tie of ties ?? []) {
      await fillTeamDefaultLineupForTie(admin, tie.id);
    }
  }

  revalidatePath(`/tournaments/${t.slug}/registrations`);
  revalidatePath(`/tournaments/${t.slug}/categories/${team.category_id}`);
  return { success: true };
}

// ── Apply both teams' default lineups (if enabled) to one tie's rubbers ─────
// Called immediately after a tie's rubber matches are created (draw
// generation, group-stage promotion) so a team with "apply to all" on never
// has to manually submit a lineup for a new tie at all.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fillTeamDefaultLineupForTie(admin: any, tieId: string) {
  const { data: tie } = await admin
    .from('ties')
    .select('id, category_id, tournament_id, team_a_id, team_b_id, lineup_a_submitted_at, lineup_b_submitted_at')
    .eq('id', tieId)
    .single();
  if (!tie || !tie.team_a_id || !tie.team_b_id) return;

  const { data: teamRows } = await admin
    .from('tournament_teams')
    .select('id, captain_id, default_lineup, default_lineup_enabled')
    .in('id', [tie.team_a_id, tie.team_b_id]);
  const teamA = (teamRows ?? []).find((x: { id: string }) => x.id === tie.team_a_id);
  const teamB = (teamRows ?? []).find((x: { id: string }) => x.id === tie.team_b_id);

  if (teamA?.default_lineup_enabled && (teamA.default_lineup ?? []).length > 0) {
    await applySideLineup(admin, tie, 'a', teamA, teamA.default_lineup as LineupSlot[]);
  }
  if (teamB?.default_lineup_enabled && (teamB.default_lineup ?? []).length > 0) {
    // Re-fetch — applying side A above may have flipped lineup_a_submitted_at
    // (and possibly the tie's status), which side B's call needs to see.
    const { data: freshTie } = await admin
      .from('ties')
      .select('id, category_id, tournament_id, team_a_id, team_b_id, lineup_a_submitted_at, lineup_b_submitted_at')
      .eq('id', tieId)
      .single();
    if (freshTie) await applySideLineup(admin, freshTie, 'b', teamB, teamB.default_lineup as LineupSlot[]);
  }
}

// ── Fetch everything a captain's lineup-submission form needs for one tie ────
export async function getTieLineupContext(tieId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: 'Not authenticated.' };

  const admin = createAdminClient();

  const { data: tie } = await admin
    .from('ties')
    .select('id, category_id, status, team_a_id, team_b_id, lineup_a_submitted_at, lineup_b_submitted_at')
    .eq('id', tieId)
    .single();
  if (!tie || !tie.team_a_id || !tie.team_b_id) return { error: 'Tie not found.' };

  const { data: category } = await admin
    .from('tournament_categories')
    .select('rubber_lineup, decider_format')
    .eq('id', tie.category_id)
    .single();

  const { data: teamA } = await admin
    .from('tournament_teams')
    .select('id, name, captain_id, captain:players!captain_id(id, full_name)')
    .eq('id', tie.team_a_id)
    .single();
  const { data: teamB } = await admin
    .from('tournament_teams')
    .select('id, name, captain_id, captain:players!captain_id(id, full_name)')
    .eq('id', tie.team_b_id)
    .single();

  const mySide: 'a' | 'b' | null =
    teamA?.captain_id === user.id ? 'a' : teamB?.captain_id === user.id ? 'b' : null;

  async function rosterFor(teamId: string, captain: { id: string; full_name: string } | null) {
    const { data: members } = await admin
      .from('team_members')
      .select('player:players!player_id(id, full_name)')
      .eq('team_id', teamId)
      .eq('status', 'active');
    const memberPlayers = (members ?? []).map((m) => m.player as unknown as { id: string; full_name: string });
    if (!captain) return memberPlayers;
    return [captain, ...memberPlayers.filter((m) => m.id !== captain.id)];
  }

  const rosterA = teamA ? await rosterFor(teamA.id, teamA.captain as unknown as { id: string; full_name: string } | null) : [];
  const rosterB = teamB ? await rosterFor(teamB.id, teamB.captain as unknown as { id: string; full_name: string } | null) : [];

  const { data: matches } = await admin
    .from('matches')
    .select(`
      id, rubber_sequence, is_decider, status,
      entry_a:tournament_entries!entry_a_id(player_id, partner_id),
      entry_b:tournament_entries!entry_b_id(player_id, partner_id)
    `)
    .eq('tie_id', tieId)
    .order('rubber_sequence', { ascending: true });

  return {
    tieId: tie.id,
    tieStatus: tie.status,
    lineupASubmitted: !!tie.lineup_a_submitted_at,
    lineupBSubmitted: !!tie.lineup_b_submitted_at,
    rubberLineup: (category?.rubber_lineup ?? []) as { sequence: number; name: string; play_format: string }[],
    deciderFormat: (category?.decider_format ?? null) as 'singles' | 'doubles' | null,
    teamA: teamA ? { id: teamA.id, name: teamA.name, roster: rosterA } : null,
    teamB: teamB ? { id: teamB.id, name: teamB.name, roster: rosterB } : null,
    mySide,
    matches: matches ?? [],
  };
}

// ── Submit a captain's player(s) for a decider rubber ────────────────────────
// Created automatically (checkAndAdvanceTie in scoring.ts) when a knockout
// tie ends tied on rubbers and the category has a decider_format configured.
// Same captain/roster validation as submitTieLineupAction, but for the single
// extra decider match rather than the whole pre-configured lineup.
export async function submitDeciderLineupAction(tieId: string, playerId: string, partnerId?: string) {
  const user = await getCurrentUser();
  if (!user) return { error: 'Not authenticated.' };

  const admin = createAdminClient();

  const { data: tie } = await admin
    .from('ties')
    .select('id, category_id, tournament_id, status, team_a_id, team_b_id')
    .eq('id', tieId)
    .single();

  if (!tie || tie.status !== 'awaiting_decider' || !tie.team_a_id || !tie.team_b_id) {
    return { error: 'This tie has no decider awaiting a lineup.' };
  }

  const { data: teamA } = await admin.from('tournament_teams').select('id, captain_id').eq('id', tie.team_a_id).single();
  const { data: teamB } = await admin.from('tournament_teams').select('id, captain_id').eq('id', tie.team_b_id).single();

  let side: 'a' | 'b';
  let captainTeam: { id: string; captain_id: string };
  if (teamA?.captain_id === user.id) { side = 'a'; captainTeam = teamA; }
  else if (teamB?.captain_id === user.id) { side = 'b'; captainTeam = teamB; }
  else return { error: 'Only a team captain can submit a decider lineup for this tie.' };

  const { data: category } = await admin
    .from('tournament_categories')
    .select('decider_format')
    .eq('id', tie.category_id)
    .single();

  const needsPartner = category?.decider_format === 'doubles';
  if (needsPartner && !partnerId) return { error: 'The decider requires two players.' };
  if (!needsPartner && partnerId) return { error: 'The decider is singles — only one player.' };

  for (const pid of [playerId, ...(partnerId ? [partnerId] : [])]) {
    const isCaptainPlaying = pid === captainTeam.captain_id;
    if (!isCaptainPlaying) {
      const { data: confirmedMember } = await admin
        .from('team_members')
        .select('id')
        .eq('team_id', captainTeam.id)
        .eq('player_id', pid)
        .eq('status', 'active')
        .maybeSingle();
      if (!confirmedMember) return { error: 'Decider player(s) must be confirmed roster members.' };
    }
  }

  const { data: deciderMatch } = await admin
    .from('matches')
    .select('id, entry_a_id, entry_b_id')
    .eq('tie_id', tieId)
    .eq('is_decider', true)
    .single();

  if (!deciderMatch) return { error: 'Decider match not found.' };

  const existingEntryId = side === 'a' ? deciderMatch.entry_a_id : deciderMatch.entry_b_id;
  const entryColumn = side === 'a' ? 'entry_a_id' : 'entry_b_id';

  if (existingEntryId) {
    await admin.from('tournament_entries').update({ player_id: playerId, partner_id: partnerId ?? null }).eq('id', existingEntryId);
  } else {
    const { data: entry, error: entryErr } = await admin
      .from('tournament_entries')
      .insert({
        tournament_id: tie.tournament_id,
        category_id: tie.category_id,
        player_id: playerId,
        partner_id: partnerId ?? null,
        team_id: captainTeam.id,
        status: 'active',
      })
      .select('id')
      .single();
    if (entryErr || !entry) return { error: 'Failed to submit decider lineup.' };
    await admin.from('matches').update({ [entryColumn]: entry.id }).eq('id', deciderMatch.id);
  }

  return { success: true };
}

// ── Reorder a team event's rubber playing order (after the draw is generated) ─
// The set of rubbers can't be changed post-draw (matches already exist per
// rubber, possibly with lineups/results attached) — but their play order is
// just display/scheduling metadata, safe to change as long as nothing has
// started yet anywhere in the category. `newOrder` is the rubber lineup's
// current sequence numbers listed in the desired new order, e.g. [2, 1, 3].
export async function reorderRubberLineupAction(
  categoryId: string,
  newOrder: number[],
): Promise<{ error: string } | { success: true }> {
  const user = await getCurrentUser();
  if (!user) return { error: 'Not authenticated.' };

  const admin = createAdminClient();

  const { data: cat } = await admin
    .from('tournament_categories')
    .select('id, tournament_id, play_format, rubber_lineup')
    .eq('id', categoryId)
    .single();
  if (!cat || cat.play_format !== 'team_event') return { error: 'Not a team event category.' };

  const t = await assertTournamentManager(cat.tournament_id, user.id);
  if (!t) return { error: 'Permission denied' };

  const rubberLineup = (cat.rubber_lineup ?? []) as { sequence: number; name: string; play_format: string }[];
  if (newOrder.length !== rubberLineup.length || new Set(newOrder).size !== rubberLineup.length) {
    return { error: 'Reordered list must contain every existing rubber exactly once.' };
  }
  const bySeq = new Map(rubberLineup.map((r) => [r.sequence, r]));
  if (newOrder.some((seq) => !bySeq.has(seq))) return { error: 'Unknown rubber in reorder list.' };

  // Block if any rubber (in any tie) has already started — reordering would
  // desync an in-progress/completed match's recorded rubber number from the
  // category's lineup.
  const { data: startedMatch } = await admin
    .from('matches')
    .select('id')
    .eq('category_id', categoryId)
    .not('tie_id', 'is', null)
    .eq('is_decider', false)
    .neq('status', 'scheduled')
    .limit(1)
    .maybeSingle();
  if (startedMatch) return { error: 'Cannot reorder — at least one rubber has already started.' };

  // old sequence -> new sequence (1-indexed, per newOrder's position)
  const oldToNewSeq = new Map(newOrder.map((oldSeq, i) => [oldSeq, i + 1]));
  const reorderedLineup = newOrder.map((oldSeq, i) => ({ ...bySeq.get(oldSeq)!, sequence: i + 1 }));

  const { error: catErr } = await admin
    .from('tournament_categories')
    .update({ rubber_lineup: reorderedLineup })
    .eq('id', categoryId);
  if (catErr) return { error: 'Failed to save new rubber order.' };

  const { data: rubberMatches } = await admin
    .from('matches')
    .select('id, rubber_sequence')
    .eq('category_id', categoryId)
    .not('tie_id', 'is', null)
    .eq('is_decider', false);

  await Promise.all(
    (rubberMatches ?? [])
      .filter((m) => m.rubber_sequence !== null && oldToNewSeq.has(m.rubber_sequence))
      .map((m) => admin.from('matches').update({ rubber_sequence: oldToNewSeq.get(m.rubber_sequence!) }).eq('id', m.id)),
  );

  revalidatePath(`/tournaments/${t.slug}/categories/${categoryId}`);
  return { success: true };
}
