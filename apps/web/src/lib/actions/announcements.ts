'use server';

import { revalidatePath } from 'next/cache';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { sendPushToPlayer } from './push';

export type AnnouncementUrgency = 'normal' | 'urgent';

export interface Announcement {
  id: string;
  tournament_id: string;
  message: string;
  urgency: AnnouncementUrgency;
  sent_by: string;
  sent_at: string;
  dismissed_at: string | null;
  also_push_notify: boolean;
  sender_name: string;
}

// ── Manager: send a new announcement ─────────────────────────────────────────

export async function sendAnnouncementAction(
  tournamentId: string,
  tournamentSlug: string,
  message: string,
  urgency: AnnouncementUrgency,
  alsoPushNotify: boolean,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const admin = createAdminClient();

  // Verify caller manages the club that owns this tournament
  const { data: tournament } = await admin
    .from('tournaments')
    .select('club_id, name, slug')
    .eq('id', tournamentId)
    .single();
  if (!tournament) return { error: 'Tournament not found.' };

  const { data: mgr } = await admin
    .from('club_managers')
    .select('role')
    .eq('club_id', tournament.club_id as string)
    .eq('player_id', user.id)
    .maybeSingle();
  if (!mgr) return { error: 'Not authorized.' };

  const { error } = await admin.from('announcements').insert({
    tournament_id: tournamentId,
    message: message.trim(),
    urgency,
    sent_by: user.id,
    also_push_notify: alsoPushNotify,
  });
  if (error) return { error: 'Failed to send announcement. Please try again.' };

  // Send push notifications to all active entrants (fire-and-forget)
  if (alsoPushNotify) {
    const { data: entries } = await admin
      .from('tournament_entries')
      .select('player_id')
      .eq('tournament_id', tournamentId)
      .eq('status', 'active');

    const playerIds = [
      ...new Set((entries ?? []).map((e) => e.player_id as string)),
    ];

    const tName = tournament.name as string;
    const tSlug = tournament.slug as string;
    const pushTitle = `${urgency === 'urgent' ? '🚨 ' : '📢 '}${tName}`;

    await Promise.allSettled(
      playerIds.map((pid) =>
        sendPushToPlayer(pid, pushTitle, message.trim(), `/events/${tSlug}`),
      ),
    );
  }

  revalidatePath(`/tournaments/${tournamentSlug}/announcements`);
  return { success: true };
}

// ── Manager: archive an announcement (hide from public view) ──────────────────

export async function archiveAnnouncementAction(
  announcementId: string,
  tournamentSlug: string,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const admin = createAdminClient();

  // Look up announcement → tournament → club, then verify manager
  const { data: ann } = await admin
    .from('announcements')
    .select('tournament_id')
    .eq('id', announcementId)
    .single();
  if (!ann) return { error: 'Announcement not found.' };

  const { data: tourney } = await admin
    .from('tournaments')
    .select('club_id')
    .eq('id', ann.tournament_id as string)
    .single();
  if (!tourney) return { error: 'Tournament not found.' };

  const { data: mgr } = await admin
    .from('club_managers')
    .select('role')
    .eq('club_id', tourney.club_id as string)
    .eq('player_id', user.id)
    .maybeSingle();
  if (!mgr) return { error: 'Not authorized.' };

  await admin
    .from('announcements')
    .update({ dismissed_at: new Date().toISOString() })
    .eq('id', announcementId);

  revalidatePath(`/tournaments/${tournamentSlug}/announcements`);
  return { success: true };
}

// ── Read: all announcements (manager view) ────────────────────────────────────

export async function getAnnouncementsAction(
  tournamentId: string,
): Promise<Announcement[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('announcements')
    .select('*, players!sent_by(full_name)')
    .eq('tournament_id', tournamentId)
    .order('sent_at', { ascending: false });

  return (data ?? []).map((a) => ({
    id: a.id as string,
    tournament_id: a.tournament_id as string,
    message: a.message as string,
    urgency: a.urgency as AnnouncementUrgency,
    sent_by: a.sent_by as string,
    sent_at: a.sent_at as string,
    dismissed_at: a.dismissed_at as string | null,
    also_push_notify: a.also_push_notify as boolean,
    sender_name:
      (a.players as { full_name: string } | null)?.full_name ?? 'Unknown',
  }));
}

// ── Read: active (non-archived) announcements (player-facing view) ────────────

export async function getActiveAnnouncementsAction(
  tournamentId: string,
): Promise<Announcement[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('announcements')
    .select('id, tournament_id, message, urgency, sent_by, sent_at, dismissed_at, also_push_notify')
    .eq('tournament_id', tournamentId)
    .is('dismissed_at', null)
    .order('sent_at', { ascending: false });

  return (data ?? []).map((a) => ({
    id: a.id as string,
    tournament_id: a.tournament_id as string,
    message: a.message as string,
    urgency: a.urgency as AnnouncementUrgency,
    sent_by: a.sent_by as string,
    sent_at: a.sent_at as string,
    dismissed_at: null,
    also_push_notify: a.also_push_notify as boolean,
    sender_name: '',
  }));
}
