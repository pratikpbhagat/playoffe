'use server';

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { sendEmail } from '@/lib/email/service';
import { buildTournamentInviteEmail } from '@/lib/email/templates/tournament-invite';
import { createNotificationForPlayer } from './notifications';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

interface InviteResult {
  username: string;
  status: 'sent' | 'already_registered' | 'not_found' | 'error';
  name?: string;
}

/**
 * sendTournamentInvitesAction
 *
 * Invites a list of players (by username) to a tournament.
 * - Verifies the caller is a club manager for the tournament
 * - Skips players already registered
 * - Sends a branded email + in-app notification to each player
 * - Returns per-player results for UI feedback
 */
export async function sendTournamentInvitesAction(
  tournamentId: string,
  usernames: string[],
): Promise<{ results?: InviteResult[]; error?: string }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Not authenticated' };

    const admin = createAdminClient();

    // Fetch tournament + verify caller is manager
    const { data: t } = await admin
      .from('tournaments')
      .select('id, name, slug, club_id, start_date, venue')
      .eq('id', tournamentId)
      .single();
    if (!t) return { error: 'Tournament not found' };

    const { data: mgr } = await admin
      .from('club_managers')
      .select('role')
      .eq('club_id', t.club_id)
      .eq('player_id', user.id)
      .maybeSingle();
    if (!mgr) return { error: 'Permission denied' };

    // Caller name for the invite
    const { data: inviter } = await admin
      .from('players')
      .select('full_name')
      .eq('id', user.id)
      .single();
    const inviterName = inviter?.full_name ?? 'The organiser';

    // Existing registrations (active/pending/waitlisted) to skip
    const { data: existingEntries } = await admin
      .from('tournament_entries')
      .select('players!player_id(username)')
      .eq('tournament_id', tournamentId)
      .not('status', 'eq', 'withdrawn');

    type EntryWithUsername = { players: { username: string } | null };
    const alreadyRegistered = new Set(
      (existingEntries as unknown as EntryWithUsername[] ?? [])
        .map((e) => e.players?.username)
        .filter((u): u is string => !!u),
    );

    // Deduplicate and clean usernames
    const cleaned = [...new Set(usernames.map((u) => u.trim().replace(/^@/, '').toLowerCase()))].filter(Boolean);

    // Batch-fetch players by username
    const { data: players } = await admin
      .from('players')
      .select('id, username, full_name, email')
      .in('username', cleaned);

    const playerMap = new Map(
      (players ?? []).map((p) => [p.username.toLowerCase(), p]),
    );

    // Process each username
    const results: InviteResult[] = await Promise.all(
      cleaned.map(async (username): Promise<InviteResult> => {
        const player = playerMap.get(username);

        if (!player) {
          return { username, status: 'not_found' };
        }

        if (alreadyRegistered.has(player.username)) {
          return { username, status: 'already_registered', name: player.full_name };
        }

        try {
          // Send email (fire-and-forget errors)
          if (player.email) {
            const payload = buildTournamentInviteEmail({
              recipientName: player.full_name,
              inviterName,
              tournamentName: t.name,
              tournamentSlug: t.slug,
              startDate: t.start_date,
              venue: t.venue as string | null,
              appUrl: APP_URL,
            });
            void sendEmail({ to: player.email, ...payload });
          }

          // In-app notification
          void createNotificationForPlayer(
            player.id,
            'tournament_invite',
            `You're invited to ${t.name}`,
            `${inviterName} has invited you to compete. Register now!`,
            `/events/${t.slug}`,
          );

          return { username, status: 'sent', name: player.full_name };
        } catch {
          return { username, status: 'error' };
        }
      }),
    );

    return { results };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
