'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import type { DisplaySlide } from '@pickleball/shared';

// ── Auth guard ────────────────────────────────────────────────────────────────

async function assertTournamentManager(tournamentId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();

  const { data: t } = await admin
    .from('tournaments')
    .select('id, club_id, slug')
    .eq('id', tournamentId)
    .single();
  if (!t) throw new Error('Tournament not found');

  const { data: mgr } = await admin
    .from('club_managers')
    .select('role')
    .eq('club_id', t.club_id)
    .eq('player_id', user.id)
    .maybeSingle();
  if (!mgr) throw new Error('Not authorised');

  return { user, admin, slug: t.slug };
}

// ── Actions ───────────────────────────────────────────────────────────────────

export async function updateDisplaySlideAction(
  tournamentId: string,
  slide: DisplaySlide,
  pin: boolean,
) {
  try {
    const { user, admin, slug } = await assertTournamentManager(tournamentId);

    await admin
      .from('display_state')
      .update({
        current_slide: slide,
        is_pinned: pin,
        last_updated_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq('tournament_id', tournamentId);

    revalidatePath(`/tournaments/${slug}/display-control`);
    return { success: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function updateDisplayPausedAction(
  tournamentId: string,
  isPaused: boolean,
) {
  try {
    const { user, admin, slug } = await assertTournamentManager(tournamentId);

    await admin
      .from('display_state')
      .update({
        is_paused: isPaused,
        last_updated_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq('tournament_id', tournamentId);

    revalidatePath(`/tournaments/${slug}/display-control`);
    return { success: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function updateRotationIntervalAction(
  tournamentId: string,
  intervalSecs: number,
) {
  try {
    const { user, admin, slug } = await assertTournamentManager(tournamentId);

    await admin
      .from('display_state')
      .update({
        rotation_interval_secs: Math.max(5, Math.min(300, intervalSecs)),
        last_updated_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq('tournament_id', tournamentId);

    revalidatePath(`/tournaments/${slug}/display-control`);
    return { success: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function updateEnabledSlidesAction(
  tournamentId: string,
  slides: DisplaySlide[],
) {
  try {
    if (slides.length === 0) return { error: 'At least one slide must be enabled' };
    const { user, admin, slug } = await assertTournamentManager(tournamentId);

    await admin
      .from('display_state')
      .update({
        enabled_slides: slides,
        last_updated_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq('tournament_id', tournamentId);

    revalidatePath(`/tournaments/${slug}/display-control`);
    return { success: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function sendAnnouncementAction(
  tournamentId: string,
  message: string,
  urgency: 'normal' | 'urgent',
) {
  try {
    const { user, admin, slug } = await assertTournamentManager(tournamentId);

    if (!message.trim()) return { error: 'Message cannot be empty' };
    if (message.length > 200) return { error: 'Message too long (max 200 chars)' };

    const { data: ann, error } = await admin
      .from('announcements')
      .insert({
        tournament_id: tournamentId,
        message: message.trim(),
        urgency,
        sent_by: user.id,
      })
      .select('id')
      .single();

    if (error) return { error: error.message };

    // Auto-switch display to announcement slide and pin it
    await admin
      .from('display_state')
      .update({
        current_slide: 'announcement',
        is_pinned: true,
        active_announcement_id: ann.id,
        last_updated_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq('tournament_id', tournamentId);

    revalidatePath(`/tournaments/${slug}/display-control`);
    return { success: true, announcementId: ann.id };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function dismissAnnouncementAction(
  tournamentId: string,
  announcementId: string,
) {
  try {
    const { admin, slug } = await assertTournamentManager(tournamentId);

    await admin
      .from('announcements')
      .update({ dismissed_at: new Date().toISOString() })
      .eq('id', announcementId);

    // Unpin display and resume rotation
    await admin
      .from('display_state')
      .update({
        is_pinned: false,
        active_announcement_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq('tournament_id', tournamentId)
      .eq('current_slide', 'announcement');

    revalidatePath(`/tournaments/${slug}/display-control`);
    return { success: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
