'use server';

import crypto from 'crypto';
import { revalidatePath } from 'next/cache';
import { headers, cookies } from 'next/headers';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { createNotificationsForPlayers } from '@/lib/actions/notifications';

function hashPin(pin: string) {
  return crypto.createHash('sha256').update(pin.trim()).digest('hex');
}

// ── Generate a referee PIN for a tournament ───────────────────────────────────
export async function createRefereePinAction(tournamentId: string, label: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const admin = createAdminClient();

  // Verify manager
  const { data: t } = await admin.from('tournaments').select('club_id, slug').eq('id', tournamentId).single();
  if (!t) return { error: 'Tournament not found' };

  const { data: mgr } = await admin.from('club_managers').select('role')
    .eq('club_id', t.club_id).eq('player_id', user.id).maybeSingle();
  if (!mgr) return { error: 'Permission denied' };

  const trimmedLabel = label.trim() || 'Referee';

  // Enforce unique label per tournament (active PINs only)
  const now = new Date().toISOString();
  const { data: duplicate } = await admin
    .from('tournament_referee_pins')
    .select('id')
    .eq('tournament_id', tournamentId)
    .eq('label', trimmedLabel)
    .eq('is_revoked', false)
    .gt('expires_at', now)
    .maybeSingle();

  if (duplicate) return { error: `A referee named "${trimmedLabel}" already exists for this tournament. Use a different label.` };

  // Generate a random 6-digit PIN
  const pin = String(Math.floor(100000 + Math.random() * 900000));
  const pinHash = hashPin(pin);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // 7-day expiry

  const { error } = await admin.from('tournament_referee_pins').insert({
    tournament_id: tournamentId,
    pin_hash: pinHash,
    label: trimmedLabel,
    created_by: user.id,
    expires_at: expiresAt.toISOString(),
  });

  if (error) return { error: 'Failed to create PIN' };

  return { success: true, pin };
}

// ── Revoke a PIN ──────────────────────────────────────────────────────────────
export async function revokePinAction(pinId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const admin = createAdminClient();
  await admin.from('tournament_referee_pins').update({ is_revoked: true }).eq('id', pinId);
  revalidatePath('/');
  return { success: true };
}

// ── Delete a referee: revoke their PIN + deactivate their session ─────────────
// Used from the "Active Referees" panel — one action cleans up both the PIN
// (so they can't check in again) and the session (removes them from the list).
export async function deleteRefereeAction(pinId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const admin = createAdminClient();

  // Fetch pin to verify tournament + manager access, and get the referee's label
  const { data: pin } = await admin
    .from('tournament_referee_pins')
    .select('tournament_id, label')
    .eq('id', pinId)
    .maybeSingle();

  if (!pin) return { error: 'PIN not found' };

  const { data: t } = await admin
    .from('tournaments')
    .select('club_id')
    .eq('id', pin.tournament_id)
    .single();

  if (!t) return { error: 'Tournament not found' };

  const { data: mgr } = await admin
    .from('club_managers')
    .select('role')
    .eq('club_id', t.club_id)
    .eq('player_id', user.id)
    .maybeSingle();

  if (!mgr) return { error: 'Permission denied' };

  // Revoke PIN + deactivate all sessions tied to it
  await admin.from('tournament_referee_pins').update({ is_revoked: true }).eq('id', pinId);
  await (admin.from('referee_sessions' as any).update({ is_active: false }).eq('pin_id', pinId));

  // Clear this referee's assignment from any scheduled/in-progress matches so the
  // individual match scoring page immediately reflects that no referee is assigned.
  // Completed/walkover matches retain their attribution record.
  const refName = (pin.label ?? '').trim() || 'Referee';
  await admin
    .from('matches')
    .update({ assigned_referee_name: null })
    .eq('tournament_id', pin.tournament_id)
    .eq('assigned_referee_name', refName)
    .in('status', ['scheduled', 'in_progress']);

  revalidatePath('/');
  return { success: true };
}

// ── Regenerate a PIN (revoke old, create new with same label) ─────────────────
export async function regeneratePinAction(pinId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const admin = createAdminClient();

  // Fetch the existing pin to get its label and tournament_id
  const { data: existing } = await admin
    .from('tournament_referee_pins')
    .select('tournament_id, label')
    .eq('id', pinId)
    .maybeSingle();

  if (!existing) return { error: 'PIN not found' };

  // Verify the user is a manager of this tournament's club
  const { data: t } = await admin
    .from('tournaments')
    .select('club_id')
    .eq('id', existing.tournament_id)
    .single();

  if (!t) return { error: 'Tournament not found' };

  const { data: mgr } = await admin
    .from('club_managers')
    .select('role')
    .eq('club_id', t.club_id)
    .eq('player_id', user.id)
    .maybeSingle();

  if (!mgr) return { error: 'Permission denied' };

  // Revoke the old PIN and deactivate its sessions so the "active referees"
  // strip doesn't show a stale duplicate after regeneration.
  await admin.from('tournament_referee_pins').update({ is_revoked: true }).eq('id', pinId);
  await (admin.from('referee_sessions' as any).update({ is_active: false }).eq('pin_id', pinId));

  // Generate a fresh PIN with the same label
  const pin = String(Math.floor(100000 + Math.random() * 900000));
  const pinHash = hashPin(pin);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  const { error } = await admin.from('tournament_referee_pins').insert({
    tournament_id: existing.tournament_id,
    pin_hash: pinHash,
    label: existing.label ?? 'Referee',
    created_by: user.id,
    expires_at: expiresAt.toISOString(),
  });

  if (error) return { error: 'Failed to generate new PIN' };

  revalidatePath('/');
  return { success: true, pin };
}

// ── Validate a PIN and return tournament info ─────────────────────────────────
export async function validateRefereePinAction(pin: string) {
  const admin = createAdminClient();

  // Read caller IP
  const headersList = await headers();
  const ip = headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';

  // Check rate limit
  const { data: limit } = await (admin
    .from('pin_rate_limits' as any)
    .select('attempt_count, blocked_until')
    .eq('ip_address', ip)
    .maybeSingle()) as { data: { attempt_count: number; blocked_until: string | null } | null };

  if (limit?.blocked_until && new Date(limit.blocked_until) > new Date()) {
    return { success: false, error: 'Too many attempts. Please wait 5 minutes before trying again.' };
  }

  const pinHash = hashPin(pin);

  const { data } = await admin
    .from('tournament_referee_pins')
    .select('id, label, tournament_id, expires_at, is_revoked, tournaments(id, name, slug, status)')
    .eq('pin_hash', pinHash)
    .eq('is_revoked', false)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (!data) {
    // Increment rate limit counter
    const now = new Date();
    if (!limit) {
      await (admin.from('pin_rate_limits' as any).insert({ ip_address: ip, attempt_count: 1 }));
    } else {
      const newCount = (limit.attempt_count ?? 0) + 1;
      const blockedUntil = newCount >= 3
        ? new Date(now.getTime() + 5 * 60 * 1000).toISOString()
        : null;
      await (admin.from('pin_rate_limits' as any)
        .update({ attempt_count: newCount, blocked_until: blockedUntil, updated_at: now.toISOString() })
        .eq('ip_address', ip));
    }
    return { success: false, error: 'Invalid or expired PIN' };
  }

  const tournament = data.tournaments as { id: string; name: string; slug: string; status: string } | null;
  if (!tournament) return { error: 'Tournament not found' };
  // Allow access for any active tournament state — the admin controls access
  // via PIN revocation/expiry. Blocking by status caused 404s when the admin
  // assigned matches to referees before officially marking the tournament as
  // in_progress (e.g. while still in draw_generated or registration_open).
  if (tournament.status === 'cancelled') {
    return { error: 'This tournament has been cancelled.' };
  }

  // Reset rate limit on success
  await (admin.from('pin_rate_limits' as any).delete().eq('ip_address', ip));

  return {
    success: true,
    pinId: data.id,
    label: data.label,
    tournament,
  };
}

// ── Fetch matches assigned to this referee (by valid PIN + referee name) ───────
// Returns:
//   matches         — active (scheduled + in_progress, non-paused) matches
//   completedMatches — up to 20 recently completed/walkover matches (newest first)
export async function getRefereeMatchesAction(pin: string, refereeName?: string) {
  const validated = await validateRefereePinAction(pin);
  if (!validated.success || !validated.tournament) return { error: validated.error ?? 'Invalid PIN' };

  const admin = createAdminClient();

  const SELECT = `
    id, round, round_name, group_name, court, status, sets, winner_entry_id,
    assigned_referee_name, paused_for_reassignment, restart_requested, restart_requested_reason,
    assigned_at, completed_at, serving_entry_id, server_number,
    ea:tournament_entries!entry_a_id(id, seed, players!player_id(full_name, username), partner:players!partner_id(full_name)),
    eb:tournament_entries!entry_b_id(id, seed, players!player_id(full_name, username), partner:players!partner_id(full_name)),
    tc:tournament_categories!category_id(scoring_override, scoring_format, points_per_set, win_by)
  `;

  // Fetch tournament-level scoring defaults as a fallback
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: tScoring } = await (admin as any)
    .from('tournaments')
    .select('scoring_format, points_per_set, win_by')
    .eq('id', validated.tournament.id)
    .single() as { data: { scoring_format: string | null; points_per_set: number | null; win_by: number | null } | null };

  // Build active and completed queries in parallel
  let activeQ = admin
    .from('matches')
    .select(SELECT)
    .eq('tournament_id', validated.tournament.id)
    .in('status', ['scheduled', 'in_progress'])
    .eq('paused_for_reassignment', false)
    .not('entry_a_id', 'is', null)
    .not('entry_b_id', 'is', null);

  let completedQ = admin
    .from('matches')
    .select(SELECT)
    .eq('tournament_id', validated.tournament.id)
    .in('status', ['completed', 'walkover'])
    .not('entry_a_id', 'is', null)
    .not('entry_b_id', 'is', null);

  if (refereeName) {
    activeQ = activeQ.eq('assigned_referee_name', refereeName);
    // Use OR so completed matches appear whether they were found via the formal
    // assignment (assigned_referee_name) or via who actually submitted the
    // result through their PIN (submitted_by_name). The two can diverge when:
    //   • assigned_referee_name was cleared by a pause-request before completion
    //   • the PIN was regenerated with a different label after the match was scored
    completedQ = completedQ.or(
      `assigned_referee_name.eq.${refereeName},submitted_by_name.eq.${refereeName}`,
    );
  }

  const [
    { data: activeRaw,    error: activeError    },
    { data: completedRaw, error: completedError },
  ] = await Promise.all([
    activeQ
      .order('status',      { ascending: true })           // in_progress before scheduled
      .order('assigned_at', { ascending: true, nullsFirst: false })
      .order('court',       { ascending: true, nullsFirst: false }),
    completedQ
      .order('completed_at', { ascending: false, nullsFirst: false })
      .limit(20),
  ]);

  if (activeError) {
    console.error('[getRefereeMatchesAction] active query error:', activeError);
    return { success: false as const, error: `Failed to load matches: ${activeError.message}` };
  }
  if (completedError) {
    // Non-fatal: log and continue with empty completed list
    console.error('[getRefereeMatchesAction] completed query error:', completedError);
  }

  type EntryRaw = {
    id: string;
    seed: number | null;
    players: { full_name: string; username: string } | null;
    partner: { full_name: string } | null;
  } | null;

  function formatMatch(m: Record<string, unknown>) {
    const ea = m.ea as EntryRaw;
    const eb = m.eb as EntryRaw;
    const tc = m.tc as { scoring_override: boolean; scoring_format: string | null; points_per_set: number | null; win_by: number | null } | null;
    // Resolve effective scoring: category override → tournament default → built-in default
    const pointsPerSet = (tc?.scoring_override ? tc?.points_per_set : null) ?? tScoring?.points_per_set ?? 11;
    const winBy = (tc?.scoring_override ? tc?.win_by : null) ?? tScoring?.win_by ?? 2;
    const scoringFormat = ((tc?.scoring_override ? tc?.scoring_format : null) ?? tScoring?.scoring_format ?? 'traditional') as 'rally' | 'traditional';
    return {
      id: m.id as string,
      round: m.round as number,
      round_name: m.round_name as string | null,
      group_name: m.group_name as string | null,
      court: m.court as number | null,
      status: m.status as string,
      sets: (m.sets ?? []) as { score_a: number; score_b: number }[],
      winner_entry_id: m.winner_entry_id as string | null,
      assigned_referee_name: m.assigned_referee_name as string | null,
      paused_for_reassignment: (m.paused_for_reassignment as boolean) ?? false,
      restart_requested: (m.restart_requested as boolean) ?? false,
      restart_requested_reason: m.restart_requested_reason as string | null,
      assigned_at: m.assigned_at as string | null,
      completed_at: m.completed_at as string | null,
      entry_a: ea ? {
        id: ea.id,
        seed: ea.seed,
        player_name: ea.players?.full_name ?? 'Unknown',
        partner_name: ea.partner?.full_name ?? null,
      } : null,
      entry_b: eb ? {
        id: eb.id,
        seed: eb.seed,
        player_name: eb.players?.full_name ?? 'Unknown',
        partner_name: eb.partner?.full_name ?? null,
      } : null,
      points_per_set: pointsPerSet,
      win_by: winBy,
      scoring_format: scoringFormat,
      serving_entry_id: (m.serving_entry_id ?? null) as string | null,
      server_number: (m.server_number ?? null) as number | null,
    };
  }

  return {
    success: true,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    matches: ((activeRaw ?? []) as any[]).map(formatMatch),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    completedMatches: ((completedRaw ?? []) as any[]).map(formatMatch),
    tournament: validated.tournament,
  };
}

// ── Referee requests re-assignment (PIN-authenticated) ─────────────────────────
// Works for both scheduled (pre-start) and in_progress (paused mid-match).
// Sets paused_for_reassignment = true; the admin hub shows re-assign controls
// and the tournament managers receive an in-app notification.
export async function pauseMatchAsRefereeAction(matchId: string, pin: string) {
  const validated = await validateRefereePinAction(pin);
  if (!validated.success || !validated.tournament) {
    return { error: validated.error ?? 'Invalid PIN' };
  }

  const admin = createAdminClient();

  const { data: match } = await admin
    .from('matches')
    .select('id, tournament_id, status, court, round, round_name, group_name')
    .eq('id', matchId)
    .eq('tournament_id', validated.tournament.id)
    .single();

  if (!match) return { error: 'Match not found' };
  if (match.status === 'completed' || match.status === 'walkover') {
    return { error: 'Cannot request re-assignment for a completed match' };
  }

  const { error } = await admin
    .from('matches')
    .update({
      paused_for_reassignment: true,
      // Clear the referee assignment so the admin's dropdown is empty and they
      // must actively select (or re-select) a referee when re-assigning.
      assigned_referee_name: null,
    })
    .eq('id', matchId);

  if (error) return { error: 'Failed to request re-assignment' };

  // Notify all club managers so they see it on the admin hub immediately
  const { data: t } = await admin
    .from('tournaments')
    .select('club_id, slug, name')
    .eq('id', validated.tournament.id)
    .single();

  if (t) {
    const { data: managers } = await admin
      .from('club_managers')
      .select('player_id')
      .eq('club_id', t.club_id);

    const managerIds = (managers ?? []).map((m) => m.player_id);
    if (managerIds.length > 0) {
      const courtLabel = match.court ? `Court ${match.court}` : '';
      const roundLabel = (match.round_name as string | null) ?? `Round ${match.round}`;
      await createNotificationsForPlayers(
        managerIds,
        'reassignment_request',
        `Re-assignment requested — ${t.name}`,
        [courtLabel, roundLabel, match.group_name as string | null]
          .filter(Boolean)
          .join(' · ') || 'A referee is requesting a court or referee re-assignment.',
        `/tournaments/${t.slug}/scoring`,
      );
    }
  }

  return { success: true };
}

// ── Start a match as referee (PIN-authenticated) ───────────────────────────────
export async function startMatchAsRefereeAction(matchId: string, pin: string, servingEntryId?: string | null, serverNumber?: 1 | 2 | null) {
  const validated = await validateRefereePinAction(pin);
  if (!validated.success || !validated.tournament) {
    return { error: validated.error ?? 'Invalid PIN' };
  }

  const admin = createAdminClient();

  const { data: match } = await admin
    .from('matches')
    .select('id, tournament_id, status, assigned_referee_name')
    .eq('id', matchId)
    .eq('tournament_id', validated.tournament.id)
    .single();

  if (!match) return { error: 'Match not found' };
  if (match.status !== 'scheduled') return { error: 'Match is not in scheduled state' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patch: Record<string, any> = {
    status: 'in_progress',
    started_at: new Date().toISOString(),
    paused_for_reassignment: false,
  };
  if (servingEntryId) patch.serving_entry_id = servingEntryId;
  if (serverNumber !== undefined) patch.server_number = serverNumber;

  const { error } = await admin.from('matches').update(patch).eq('id', matchId);

  if (error) return { error: 'Failed to start match' };

  return { success: true };
}

// ── Auto-save live score (PIN-authenticated, no status change) ────────────────
// Called on debounce as the referee types. Updates the sets column so that
// score is persisted and visible in the admin hub even before the match ends.
export async function saveScoreAsRefereeAction(
  matchId: string,
  pin: string,
  sets: { score_a: number; score_b: number }[],
  servingEntryId?: string | null,
  serverNumber?: number | null,
) {
  const validated = await validateRefereePinAction(pin);
  if (!validated.success) return { error: validated.error ?? 'Invalid PIN' };

  const admin = createAdminClient();

  const { data: match } = await admin
    .from('matches')
    .select('id, tournament_id, status')
    .eq('id', matchId)
    .eq('tournament_id', validated.tournament!.id)
    .single();

  if (!match) return { error: 'Match not found' };
  if (match.status !== 'in_progress') return { error: 'Match is not in progress' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patch: Record<string, any> = {
    sets: sets.map((s, i) => ({ set_number: i + 1, score_a: s.score_a, score_b: s.score_b })),
  };
  if (servingEntryId !== undefined) patch.serving_entry_id = servingEntryId;
  if (serverNumber !== undefined) patch.server_number = serverNumber;

  const { error } = await admin.from('matches').update(patch).eq('id', matchId);

  if (error) return { error: 'Failed to save score' };

  return { success: true };
}

// ── Score a match as referee (PIN-authenticated, no user session needed) ──────
export async function scoreMatchAsRefereeAction(
  matchId: string,
  pin: string,
  sets: { score_a: number; score_b: number }[],
  winnerEntryId: string,
) {
  const validated = await validateRefereePinAction(pin);
  if (!validated.success) return { error: validated.error ?? 'Invalid PIN' };

  const cookieStore = await cookies();
  // Read the PIN-specific cookie for score attribution
  const refereeName = cookieStore.get(`ref_${pin}`)?.value ?? null;

  const admin = createAdminClient();

  const { data: match } = await admin
    .from('matches')
    .select('id, tournament_id, entry_a_id, entry_b_id, status')
    .eq('id', matchId)
    .eq('tournament_id', validated.tournament!.id)
    .single();

  if (!match) return { error: 'Match not found' };
  if (match.status === 'completed' || match.status === 'walkover') return { error: 'Match already completed' };
  if (winnerEntryId !== match.entry_a_id && winnerEntryId !== match.entry_b_id) return { error: 'Invalid winner' };

  const { error: matchErr } = await admin
    .from('matches')
    .update({
      status: 'completed',
      sets: sets.map((s, i) => ({ set_number: i + 1, score_a: s.score_a, score_b: s.score_b })),
      winner_entry_id: winnerEntryId,
      completed_at: new Date().toISOString(),
      submitted_by_name: refereeName,
      submitted_via: 'guest_pin',
      paused_for_reassignment: false,
      // Always stamp the completing referee's name so the match appears in their
      // completed section even if assigned_referee_name was null (e.g. it was
      // cleared by a pause-request) or references a stale label (e.g. the PIN
      // was regenerated with a different label since the match was assigned).
      assigned_referee_name: refereeName,
    })
    .eq('id', matchId);

  if (matchErr) return { error: 'Failed to save result: ' + matchErr.message };

  return { success: true };
}

// ── Referee requests restart of a completed match (accidental end) ─────────────
// Sets restart_requested = true and notifies tournament admin.
// Only admin can approve the restart (via approveMatchRestartAction in scoring.ts).
export async function requestMatchRestartAction(
  matchId: string,
  pin: string,
  reason?: string,
) {
  const validated = await validateRefereePinAction(pin);
  if (!validated.success || !validated.tournament) {
    return { error: validated.error ?? 'Invalid PIN' };
  }

  const admin = createAdminClient();

  const { data: match } = await admin
    .from('matches')
    .select('id, tournament_id, status')
    .eq('id', matchId)
    .eq('tournament_id', validated.tournament.id)
    .single();

  if (!match) return { error: 'Match not found' };
  if (match.status !== 'completed' && match.status !== 'walkover') {
    return { error: 'Can only request restart for a completed match' };
  }

  const { error } = await admin
    .from('matches')
    .update({
      restart_requested: true,
      restart_requested_reason: reason?.trim() ?? null,
    })
    .eq('id', matchId);

  if (error) return { error: 'Failed to request restart' };

  // Notify all club managers for this tournament
  const { data: t } = await admin
    .from('tournaments')
    .select('club_id, slug, name')
    .eq('id', validated.tournament.id)
    .single();

  if (t) {
    const { data: managers } = await admin
      .from('club_managers')
      .select('player_id')
      .eq('club_id', t.club_id);

    const managerIds = (managers ?? []).map((m) => m.player_id);
    if (managerIds.length > 0) {
      await createNotificationsForPlayers(
        managerIds,
        'match_restart_request',
        `Match restart requested — ${t.name}`,
        reason ? `Reason: ${reason}` : 'A referee accidentally ended a match and is requesting a restart.',
        `/tournaments/${t.slug}/scoring`,
      );
    }
  }

  return { success: true };
}

// ── Start a referee session (store PIN label in cookie + DB) ──────────────────
// The referee's identity is the PIN label (set by the admin) — NOT what they
// type. This ensures that match assignments (admin picks from PIN labels in the
// dropdown) match the referee_name used to filter their queue.
export async function startRefereeSessionAction(pin: string, _displayName?: string) {
  'use server';
  const admin = createAdminClient();

  // Validate pin and retrieve its label
  const validation = await validateRefereePinAction(pin);
  if (!validation.success) return { error: validation.error ?? 'Invalid PIN' };

  // Use the PIN label as the referee's canonical name.
  // This is the same name shown in the admin's assignment dropdown.
  const pinLabel = (validation as any).label?.trim() || 'Referee';
  const pinId    = (validation as any).pinId as string | undefined;

  if (!pinId) return { error: 'Invalid PIN record' };

  // Create referee_sessions row — log any DB error so it's not silently lost
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);
  const { error: insertError } = await (admin.from('referee_sessions' as any).insert({
    tournament_id: validation.tournament?.id,
    pin_id: pinId,
    referee_name: pinLabel,
    expires_at: expiresAt.toISOString(),
    is_active: true,
  }));

  if (insertError) {
    console.error('[startRefereeSessionAction] session insert failed:', insertError);
    // Continue anyway — the cookie alone is enough to reach the scoring view.
  }

  // Set a PIN-specific cookie so multiple PIN tabs in the same browser session
  // remain independent (e.g. Court 1 + Court 2 open in separate incognito tabs).
  const cookieStore = await cookies();
  cookieStore.set(`ref_${pin}`, pinLabel, {
    httpOnly: false,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  });

  // Invalidate the cached ref page so the subsequent router.refresh() always
  // renders a fresh server component that can read the newly-set cookie.
  revalidatePath(`/ref/${pin}`);

  return { success: true };
}
