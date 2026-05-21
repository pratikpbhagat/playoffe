import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { csvImportRowSchema } from '@pickleball/shared';
import { getInitialRating } from '@pickleball/rating';
import { generateUsernameFromName } from '@/lib/utils/username';
import { randomBytes } from 'crypto';

export async function POST(request: Request) {
  const body = await request.json();
  const { tournament_id, category_id, rows } = body;

  if (!tournament_id || !category_id || !Array.isArray(rows)) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const admin = await createAdminClient();

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
      const claimToken = randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      const fakeAuthUser = await admin.auth.admin.createUser({
        email: email.toLowerCase(),
        email_confirm: false,
      });

      if (fakeAuthUser.error || !fakeAuthUser.data.user) {
        results.errors.push(`Failed to create provisional account for ${email}`);
        results.skipped++;
        continue;
      }

      await admin.from('players').insert({
        id: fakeAuthUser.data.user.id,
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
        player_id: fakeAuthUser.data.user.id,
        total_matches: 0,
        wins: 0,
        losses: 0,
        win_rate: 0,
        current_rating: getInitialRating(),
        peak_rating: getInitialRating(),
        singles_matches: 0,
        singles_wins: 0,
        doubles_matches: 0,
        doubles_wins: 0,
        mixed_doubles_matches: 0,
        mixed_doubles_wins: 0,
        updated_at: new Date().toISOString(),
      });

      await admin.from('player_profiles').insert({
        player_id: fakeAuthUser.data.user.id,
        bio: null,
        headline: null,
        career_history: [],
        certifications: [],
        playing_since: null,
        preferred_style: null,
        updated_at: new Date().toISOString(),
      });

      playerId = fakeAuthUser.data.user.id;
      results.provisional++;
    }

    await admin.from('tournament_entries').upsert({
      tournament_id,
      category_id,
      player_id: playerId,
      status: 'active',
    }, { onConflict: 'category_id,player_id', ignoreDuplicates: true });
  }

  return NextResponse.json({ success: true, results });
}
