import { NextResponse } from 'next/server';
import { createAdminClient, getCurrentUser } from '@/lib/supabase/server';
import { teamCsvImportRowSchema } from '@pickleball/shared';
import { INITIAL_RATING } from '@pickleball/rating';
import { generateUsernameFromName } from '@/lib/utils/username';
import { sendEmail } from '@/lib/email/service';
import { buildProvisionalInviteEmail } from '@/lib/email/templates/provisional-invite';
import { randomBytes } from 'crypto';

const MAX_ROWS = 500;

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await request.json();
  const { tournament_id, category_id, rows } = body;

  if (!tournament_id || !category_id || !Array.isArray(rows)) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }
  if (rows.length > MAX_ROWS) {
    return NextResponse.json({ error: `Too many rows — max ${MAX_ROWS} per import` }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: tournament } = await admin
    .from('tournaments')
    .select('name, club_id, clubs(name)')
    .eq('id', tournament_id)
    .single();
  if (!tournament) return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });

  const { data: mgr } = await admin
    .from('club_managers')
    .select('role')
    .eq('club_id', tournament.club_id)
    .eq('player_id', user.id)
    .maybeSingle();
  if (!mgr) return NextResponse.json({ error: 'Permission denied — you are not a manager of this club.' }, { status: 403 });

  const { data: category } = await admin
    .from('tournament_categories')
    .select('play_format, roster_composition')
    .eq('id', category_id)
    .single();
  if (!category || category.play_format !== 'team_event') {
    return NextResponse.json({ error: 'This import is only for team event categories' }, { status: 400 });
  }

  const tournamentName = tournament.name ?? 'a tournament';
  const clubName = (tournament.clubs as { name: string } | null)?.name ?? 'the organiser';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const results = { teamsCreated: 0, linked: 0, provisional: 0, skipped: 0, warnings: [] as string[], errors: [] as string[] };

  // Group parsed rows by team_name, in input order.
  // A row can be flagged as captain via `is_captain` (true/1/yes); otherwise the
  // first row for the team is the captain (backward compatible default).
  type Row = { full_name: string; email: string; gender: 'male' | 'female' | 'other'; dob: string | null | undefined; isCaptain: boolean };
  const teamGroups = new Map<string, Row[]>();
  const teamOwnerNames = new Map<string, string>();
  for (const rawRow of rows) {
    const parsed = teamCsvImportRowSchema.safeParse(rawRow);
    if (!parsed.success) {
      results.errors.push(`Row for ${rawRow.email ?? '(unknown)'}: ${parsed.error.issues[0].message}`);
      results.skipped++;
      continue;
    }
    const { team_name, full_name, email, gender, dob, owner_name, is_captain } = parsed.data;
    if (!teamGroups.has(team_name)) teamGroups.set(team_name, []);
    const isCaptain = ['true', '1', 'yes', 'y'].includes((is_captain ?? '').toLowerCase());
    teamGroups.get(team_name)!.push({ full_name, email, gender, dob, isCaptain });
    if (owner_name && !teamOwnerNames.has(team_name)) teamOwnerNames.set(team_name, owner_name);
  }

  async function resolvePlayer(row: Row) {
    const email = row.email.toLowerCase();
    const { data: existing } = await admin.from('players').select('id, gender, dob').eq('email', email).maybeSingle();
    if (existing) {
      results.linked++;
      return { ...existing, isCaptain: row.isCaptain };
    }

    const claimToken = randomBytes(32).toString('hex');
    const { data: authUser, error: authErr } = await admin.auth.admin.createUser({ email, email_confirm: false });
    if (authErr || !authUser.user) {
      results.errors.push(`Failed to create provisional account for ${email}`);
      return null;
    }

    await admin.from('players').insert({
      id: authUser.user.id,
      email,
      username: await generateUsernameFromName(admin, row.full_name),
      full_name: row.full_name,
      gender: row.gender,
      dob: row.dob ?? null,
      role: 'player',
      is_provisional: true,
      provisional_claim_token: claimToken,
      provisional_expires_at: expiresAt,
    });
    await admin.from('global_stats').insert({ player_id: authUser.user.id, current_rating: INITIAL_RATING, peak_rating: INITIAL_RATING });
    await admin.from('player_profiles').insert({ player_id: authUser.user.id });

    const emailPayload = buildProvisionalInviteEmail({
      recipientName: row.full_name, tournamentName, clubName, claimToken, appUrl, expiresAt,
    });
    sendEmail({ to: email, ...emailPayload }).catch((err) => {
      console.error(`[email] Failed to send invite to ${email}:`, err);
    });

    results.provisional++;
    return { id: authUser.user.id, gender: row.gender, dob: row.dob ?? null, isCaptain: row.isCaptain };
  }

  function playerAge(dob: string | null): number | null {
    if (!dob) return null;
    return Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
  }

  const rules = (category.roster_composition ?? []) as { count: number; gender?: 'male' | 'female'; age_min?: number; age_max?: number }[];

  for (const [teamName, members] of teamGroups) {
    if (members.length === 0) continue;

    const resolved: { id: string; gender: 'male' | 'female' | 'other'; dob: string | null; isCaptain: boolean }[] = [];
    for (const row of members) {
      const player = await resolvePlayer(row);
      if (player) resolved.push(player);
      else results.skipped++;
    }
    if (resolved.length === 0) continue;

    // Captain is whichever row was flagged `is_captain`; if none (or more than
    // one) was flagged, fall back to the first row for the team.
    const flaggedCaptains = resolved.filter((p) => p.isCaptain);
    const captain = flaggedCaptains.length === 1 ? flaggedCaptains[0] : resolved[0];

    const { data: existingTeam } = await admin
      .from('tournament_teams')
      .select('id')
      .eq('category_id', category_id)
      .eq('name', teamName)
      .maybeSingle();
    if (existingTeam) {
      results.errors.push(`Team "${teamName}" already exists in this category — skipped.`);
      results.skipped += resolved.length;
      continue;
    }

    const { data: team, error: teamErr } = await admin
      .from('tournament_teams')
      .insert({
        tournament_id, category_id, name: teamName, captain_id: captain.id, status: 'active',
        owner_name: teamOwnerNames.get(teamName) ?? null,
      })
      .select('id')
      .single();
    if (teamErr || !team) {
      results.errors.push(`Failed to create team "${teamName}".`);
      results.skipped += resolved.length;
      continue;
    }
    results.teamsCreated++;

    await admin.from('team_members').insert(resolved.map((m) => ({ team_id: team.id, player_id: m.id, status: 'active' as const })));

    if (rules.length > 0) {
      const shortfalls: string[] = [];
      for (const rule of rules) {
        const matching = resolved.filter((p) => {
          if (rule.gender && p.gender !== rule.gender) return false;
          const age = playerAge(p.dob);
          if (rule.age_min !== undefined && (age === null || age < rule.age_min)) return false;
          if (rule.age_max !== undefined && (age === null || age > rule.age_max)) return false;
          return true;
        });
        if (matching.length < rule.count) shortfalls.push(`${rule.count} ${rule.gender ?? 'players'} (has ${matching.length})`);
      }
      if (shortfalls.length > 0) {
        results.warnings.push(`Team "${teamName}" doesn't meet roster composition: needs ${shortfalls.join('; ')}.`);
      }
    }
  }

  return NextResponse.json({ success: true, results });
}
