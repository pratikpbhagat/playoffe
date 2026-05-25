'use server';

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { sendEmail } from '@/lib/email/service';
import { buildDigestEmail } from '@/lib/email/templates/digest';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

/**
 * sendDigestAction(clubId)
 *
 * Sends an on-demand digest email to the requesting manager.
 * Caller must be a manager of the club.
 */
export async function sendDigestAction(
  clubId: string,
): Promise<{ success?: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Not authenticated' };

    const admin = createAdminClient();

    // Verify caller is a manager of this club
    const { data: mgr } = await admin
      .from('club_managers')
      .select('role')
      .eq('club_id', clubId)
      .eq('player_id', user.id)
      .maybeSingle();
    if (!mgr) return { error: 'Permission denied' };

    // Caller's email + name
    const { data: caller } = await admin
      .from('players')
      .select('full_name, email')
      .eq('id', user.id)
      .single();
    if (!caller?.email) return { error: 'Could not find your email address' };

    // Club name
    const { data: club } = await admin
      .from('clubs')
      .select('name')
      .eq('id', clubId)
      .single();
    if (!club) return { error: 'Club not found' };

    // Fetch active/upcoming tournaments for this club
    const { data: tournaments } = await admin
      .from('tournaments')
      .select('id, name, slug, status')
      .eq('club_id', clubId)
      .in('status', ['draft', 'registration_open', 'in_progress'])
      .order('start_date', { ascending: false });

    const tournamentRows = tournaments ?? [];

    // Gather per-tournament stats in parallel
    const digestData = await Promise.all(
      tournamentRows.map(async (t) => {
        const [
          { count: activeEntries },
          { count: waitlistEntries },
          { data: matchRows },
        ] = await Promise.all([
          admin
            .from('tournament_entries')
            .select('*', { count: 'exact', head: true })
            .eq('tournament_id', t.id)
            .eq('status', 'active'),
          admin
            .from('tournament_entries')
            .select('*', { count: 'exact', head: true })
            .eq('tournament_id', t.id)
            .eq('status', 'waitlisted'),
          admin
            .from('matches')
            .select('status, player_reported_winner_id')
            .eq('tournament_id', t.id)
            .not('entry_a_id', 'is', null)
            .not('entry_b_id', 'is', null),
        ]);

        const matches = matchRows ?? [];
        const totalMatches = matches.length;
        const completedMatches = matches.filter(
          (m) => m.status === 'completed' || m.status === 'walkover',
        ).length;
        const upcomingMatches = matches.filter((m) => m.status === 'scheduled').length;
        const pendingReports = matches.filter(
          (m) =>
            m.player_reported_winner_id &&
            m.status !== 'completed' &&
            m.status !== 'walkover',
        ).length;

        return {
          name: t.name,
          slug: t.slug,
          status: t.status,
          activeEntries: activeEntries ?? 0,
          waitlistEntries: waitlistEntries ?? 0,
          pendingReports,
          upcomingMatches,
          completedMatches,
          totalMatches,
        };
      }),
    );

    const payload = buildDigestEmail({
      clubName: club.name,
      managerName: caller.full_name,
      tournaments: digestData,
      appUrl: APP_URL,
    });

    await sendEmail({ to: caller.email, ...payload });

    return { success: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
