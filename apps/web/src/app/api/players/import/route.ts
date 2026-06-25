import { NextResponse } from 'next/server';
import { createAdminClient, getCurrentUser } from '@/lib/supabase/server';
import { csvImportRowSchema } from '@pickleball/shared';
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

  // Fetch tournament + club info, and verify the caller actually manages
  // this tournament's club before creating/linking any accounts or entries.
  const { data: tournament } = await admin
    .from('tournaments')
    .select('name, club_id, clubs(name)')
    .eq('id', tournament_id)
    .single();

  if (!tournament) {
    return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
  }

  const { data: mgr } = await admin
    .from('club_managers')
    .select('role')
    .eq('club_id', tournament.club_id)
    .eq('player_id', user.id)
    .maybeSingle();

  if (!mgr) {
    return NextResponse.json({ error: 'Permission denied — you are not a manager of this club.' }, { status: 403 });
  }

  const tournamentName = tournament?.name ?? 'a tournament';
  const clubName = (tournament?.clubs as { name: string } | null)?.name ?? 'the organiser';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const results = { linked: 0, provisional: 0, skipped: 0, errors: [] as string[] };

  for (const rawRow of rows) {
    const parsed = csvImportRowSchema.safeParse(rawRow);
    if (!parsed.success) {
      results.errors.push(`Row for ${rawRow.email}: ${parsed.error.issues[0].message}`);
      results.skipped++;
      continue;
    }

    const { email, full_name, gender } = parsed.data;

    const { data: existing } = await admin
      .from('players')
      .select('id, is_provisional')
      .eq('email', email.toLowerCase())
      .single();

    let playerId: string;

    if (existing) {
      playerId = existing.id;
      results.linked++;
    } else {
      // ── Create provisional player ──────────────────────────────
      const claimToken = randomBytes(32).toString('hex');

      const { data: authUser, error: authErr } = await admin.auth.admin.createUser({
        email: email.toLowerCase(),
        email_confirm: false,
      });

      if (authErr || !authUser.user) {
        results.errors.push(`Failed to create provisional account for ${email}`);
        results.skipped++;
        continue;
      }

      await admin.from('players').insert({
        id: authUser.user.id,
        email: email.toLowerCase(),
        username: await generateUsernameFromName(admin, full_name),
        full_name,
        gender,
        role: 'player',
        is_provisional: true,
        provisional_claim_token: claimToken,
        provisional_expires_at: expiresAt,
      });

      await admin.from('global_stats').insert({
        player_id: authUser.user.id,
        current_rating: INITIAL_RATING,
        peak_rating: INITIAL_RATING,
      });

      await admin.from('player_profiles').insert({
        player_id: authUser.user.id,
      });

      // ── Send SES / Mailpit provisional invite email ────────────
      const emailPayload = buildProvisionalInviteEmail({
        recipientName: full_name,
        tournamentName,
        clubName,
        claimToken,
        appUrl,
        expiresAt,
      });
      // Fire-and-forget: don't block the import on email delivery
      sendEmail({ to: email.toLowerCase(), ...emailPayload }).catch((err) => {
        console.error(`[email] Failed to send invite to ${email}:`, err);
      });

      playerId = authUser.user.id;
      results.provisional++;
    }

    // ── Guard: player already in this category (as main or partner) ──
    // The upsert below handles player_id conflicts, but we also need to
    // skip players who were already admin-added as a doubles partner.
    const { data: alreadyEntered } = await admin
      .from('tournament_entries')
      .select('id')
      .eq('category_id', category_id)
      .or(`player_id.eq.${playerId},partner_id.eq.${playerId}`)
      .maybeSingle();

    if (alreadyEntered) {
      results.skipped++;
      continue;
    }

    // ── Insert tournament entry ────────────────────────────────
    await admin.from('tournament_entries').insert({
      tournament_id,
      category_id,
      player_id: playerId,
      status: 'active',
    });
  }

  return NextResponse.json({ success: true, results });
}
