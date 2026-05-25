'use server';

import { revalidatePath } from 'next/cache';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import {
  sendPartnerInviteNotification,
  sendEntryConfirmedNotification,
  sendEntryRejectedNotification,
  sendWaitlistPromotedNotification,
} from '@/lib/email/notifications';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Count how many active+pending entries are in a category (for capacity check). */
async function getActiveCount(categoryId: string): Promise<number> {
  const admin = createAdminClient();
  const { count } = await admin
    .from('tournament_entries')
    .select('id', { count: 'exact', head: true })
    .eq('category_id', categoryId)
    .in('status', ['active', 'pending']);
  return count ?? 0;
}

/** Promote the oldest waitlisted entry in a category to active and notify the player. */
async function promoteWaitlisted(categoryId: string) {
  const admin = createAdminClient();
  const { data: next } = await admin
    .from('tournament_entries')
    .select(`
      id,
      players!player_id(email, full_name),
      tournament_categories!category_id(name, tournaments!tournament_id(name, slug))
    `)
    .eq('category_id', categoryId)
    .eq('status', 'waitlisted')
    .order('registered_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (next) {
    await admin
      .from('tournament_entries')
      .update({ status: 'active' })
      .eq('id', next.id);

    // Fire-and-forget email notification
    type PlayerRow = { email: string; full_name: string } | null;
    type CatRow = { name: string; tournaments: { name: string; slug: string } | null } | null;
    const player = next.players as unknown as PlayerRow;
    const cat = next.tournament_categories as unknown as CatRow;
    if (player && cat?.tournaments) {
      void sendWaitlistPromotedNotification({
        playerEmail: player.email,
        playerName: player.full_name,
        tournamentName: cat.tournaments.name,
        tournamentSlug: cat.tournaments.slug,
        categoryName: cat.name,
      });
    }
  }
}

// ── Self-registration ─────────────────────────────────────────────────────────

export async function registerForCategoryAction(categoryId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'You must be logged in to register.' };

  const admin = createAdminClient();

  // Load category + tournament in one query
  const { data: cat } = await admin
    .from('tournament_categories')
    .select('id, tournament_id, status, max_entries, name, tournaments(id, slug, status, registration_deadline, auto_approve_entries, name)')
    .eq('id', categoryId)
    .single();

  if (!cat) return { error: 'Category not found.' };

  const tournament = cat.tournaments as {
    id: string;
    slug: string;
    status: string;
    registration_deadline: string | null;
    auto_approve_entries: boolean;
    name: string;
  } | null;

  if (!tournament) return { error: 'Tournament not found.' };

  // Guard: tournament must be open for registration
  if (tournament.status !== 'registration_open') {
    return { error: 'This tournament is not currently accepting registrations.' };
  }

  // Guard: registration deadline
  if (tournament.registration_deadline) {
    if (new Date() > new Date(tournament.registration_deadline)) {
      return { error: 'The registration deadline has passed.' };
    }
  }

  // Guard: category must be in registration phase
  if (cat.status !== 'registration') {
    return { error: 'This category is not currently open for registration.' };
  }

  // Guard: no duplicate entry
  const { data: existing } = await admin
    .from('tournament_entries')
    .select('id, status')
    .eq('category_id', categoryId)
    .eq('player_id', user.id)
    .not('status', 'eq', 'withdrawn')
    .maybeSingle();

  if (existing) {
    const label =
      existing.status === 'active' ? 'already registered' :
      existing.status === 'pending' ? 'pending approval' :
      existing.status === 'waitlisted' ? 'on the waitlist' : 'registered';
    return { error: `You are ${label} for this category.` };
  }

  // Determine entry status
  const activeCount = await getActiveCount(categoryId);
  const isFull = cat.max_entries !== null && activeCount >= cat.max_entries;

  let entryStatus: 'active' | 'pending' | 'waitlisted';
  if (isFull) {
    entryStatus = 'waitlisted';
  } else if (tournament.auto_approve_entries) {
    entryStatus = 'active';
  } else {
    entryStatus = 'pending';
  }

  const { error } = await admin.from('tournament_entries').insert({
    tournament_id: tournament.id,
    category_id: categoryId,
    player_id: user.id,
    status: entryStatus,
  });

  if (error) return { error: 'Failed to register. Please try again.' };

  revalidatePath(`/events/${tournament.slug}`);
  revalidatePath(`/tournaments/${tournament.slug}`);
  revalidatePath('/dashboard');
  return { success: true, status: entryStatus };
}

// ── Withdraw ──────────────────────────────────────────────────────────────────

export async function withdrawEntryAction(entryId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated.' };

  const admin = createAdminClient();

  // Fetch entry — must belong to this user
  const { data: entry } = await admin
    .from('tournament_entries')
    .select('id, player_id, category_id, status, tournament_id, tournaments!tournament_id(slug)')
    .eq('id', entryId)
    .single();

  if (!entry || entry.player_id !== user.id) return { error: 'Entry not found.' };
  if (entry.status === 'withdrawn') return { error: 'Already withdrawn.' };

  const wasActive = entry.status === 'active';
  const tSlug = (entry.tournaments as { slug: string } | null)?.slug ?? entry.tournament_id;

  await admin
    .from('tournament_entries')
    .update({ status: 'withdrawn' })
    .eq('id', entryId);

  // If the withdrawn entry was active, promote the oldest waitlisted entry
  if (wasActive) {
    await promoteWaitlisted(entry.category_id);
  }

  revalidatePath(`/events/${tSlug}`);
  revalidatePath(`/tournaments/${tSlug}`);
  revalidatePath('/dashboard');
  return { success: true };
}

// ── Manager: approve / reject ─────────────────────────────────────────────────

async function assertManagerForEntry(entryId: string, userId: string) {
  const admin = createAdminClient();
  const { data: entry } = await admin
    .from('tournament_entries')
    .select('id, player_id, category_id, tournament_id, status, tournaments(club_id, slug)')
    .eq('id', entryId)
    .single();

  if (!entry) return null;

  const t = entry.tournaments as { club_id: string; slug: string } | null;
  if (!t?.club_id) return null;

  const { data: mgr } = await admin
    .from('club_managers')
    .select('role')
    .eq('club_id', t.club_id)
    .eq('player_id', userId)
    .maybeSingle();

  return mgr ? { ...entry, tournamentSlug: t.slug } : null;
}

export async function approveEntryAction(entryId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated.' };

  const entry = await assertManagerForEntry(entryId, user.id);
  if (!entry) return { error: 'Permission denied.' };
  if (entry.status !== 'pending') return { error: 'Entry is not pending approval.' };

  const admin = createAdminClient();

  // Check capacity before approving
  const { data: cat } = await admin
    .from('tournament_categories')
    .select('max_entries, name, tournaments!tournament_id(name, slug)')
    .eq('id', entry.category_id)
    .single();

  const activeCount = await getActiveCount(entry.category_id);
  const newStatus =
    cat?.max_entries && activeCount >= cat.max_entries ? 'waitlisted' : 'active';

  await admin
    .from('tournament_entries')
    .update({ status: newStatus })
    .eq('id', entryId);

  // Notify the player if they were approved to active (not waitlisted)
  if (newStatus === 'active') {
    const { data: player } = await admin
      .from('players')
      .select('email, full_name')
      .eq('id', entry.player_id)
      .single();
    const t = cat?.tournaments as { name: string; slug: string } | null;
    if (player && t) {
      void sendEntryConfirmedNotification({
        playerEmail: player.email,
        playerName: player.full_name,
        tournamentName: t.name,
        tournamentSlug: t.slug,
        categoryName: cat?.name ?? '',
      });
    }
  }

  revalidatePath(`/tournaments/${entry.tournamentSlug}/registrations`);
  revalidatePath(`/tournaments/${entry.tournamentSlug}`);
  return { success: true, status: newStatus };
}

export async function rejectEntryAction(entryId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated.' };

  const entry = await assertManagerForEntry(entryId, user.id);
  if (!entry) return { error: 'Permission denied.' };
  if (entry.status !== 'pending') return { error: 'Entry is not pending.' };

  const admin = createAdminClient();

  // Fetch player + category/tournament names for email before marking withdrawn
  const { data: entryDetails } = await admin
    .from('tournament_entries')
    .select('players!player_id(email, full_name), tournament_categories!category_id(name, tournaments!tournament_id(name))')
    .eq('id', entryId)
    .single();

  await admin
    .from('tournament_entries')
    .update({ status: 'withdrawn' })
    .eq('id', entryId);

  // Notify the player of the rejection
  if (entryDetails) {
    type PlayerRow = { email: string; full_name: string } | null;
    type CatRow = { name: string; tournaments: { name: string } | null } | null;
    const player = entryDetails.players as unknown as PlayerRow;
    const cat = entryDetails.tournament_categories as unknown as CatRow;
    if (player && cat?.tournaments) {
      void sendEntryRejectedNotification({
        playerEmail: player.email,
        playerName: player.full_name,
        tournamentName: cat.tournaments.name,
        categoryName: cat.name,
      });
    }
  }

  revalidatePath(`/tournaments/${entry.tournamentSlug}/registrations`);
  revalidatePath(`/tournaments/${entry.tournamentSlug}`);
  return { success: true };
}

// ── Manually promote a specific waitlisted entry ──────────────────────────────
export async function promoteWaitlistedEntryAction(entryId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated.' };

  const entry = await assertManagerForEntry(entryId, user.id);
  if (!entry) return { error: 'Permission denied.' };
  if (entry.status !== 'waitlisted') return { error: 'Entry is not waitlisted.' };

  const admin = createAdminClient();

  await admin
    .from('tournament_entries')
    .update({ status: 'active' })
    .eq('id', entryId);

  // Fetch player + category/tournament for email
  const { data: details } = await admin
    .from('tournament_entries')
    .select('players!player_id(email, full_name), tournament_categories!category_id(name, tournaments!tournament_id(name, slug))')
    .eq('id', entryId)
    .single();

  if (details) {
    type PlayerRow = { email: string; full_name: string } | null;
    type CatRow = { name: string; tournaments: { name: string; slug: string } | null } | null;
    const player = details.players as unknown as PlayerRow;
    const cat = details.tournament_categories as unknown as CatRow;
    if (player && cat?.tournaments) {
      void sendWaitlistPromotedNotification({
        playerEmail: player.email,
        playerName: player.full_name,
        tournamentName: cat.tournaments.name,
        tournamentSlug: cat.tournaments.slug,
        categoryName: cat.name,
      });
    }
  }

  revalidatePath(`/tournaments/${entry.tournamentSlug}/registrations`);
  revalidatePath(`/tournaments/${entry.tournamentSlug}`);
  return { success: true };
}

export async function bulkApproveEntriesAction(categoryId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated.' };

  const admin = createAdminClient();

  // Verify manager access via the category's tournament
  const { data: cat } = await admin
    .from('tournament_categories')
    .select('tournament_id, max_entries, tournaments(club_id, slug)')
    .eq('id', categoryId)
    .single();

  if (!cat) return { error: 'Category not found.' };
  const tData = cat.tournaments as { club_id: string; slug: string } | null;
  if (!tData?.club_id) return { error: 'Permission denied.' };
  const clubId = tData.club_id;

  const { data: mgr } = await admin
    .from('club_managers')
    .select('role')
    .eq('club_id', clubId)
    .eq('player_id', user.id)
    .maybeSingle();
  if (!mgr) return { error: 'Permission denied.' };

  // Fetch all pending entries for this category, oldest first
  const { data: pending } = await admin
    .from('tournament_entries')
    .select('id')
    .eq('category_id', categoryId)
    .eq('status', 'pending')
    .order('registered_at', { ascending: true });

  if (!pending || pending.length === 0) return { success: true, approved: 0 };

  // Determine how many slots remain
  const activeCount = await getActiveCount(categoryId);
  const available = cat.max_entries ? Math.max(0, cat.max_entries - activeCount) : pending.length;

  const toApprove = pending.slice(0, available).map((e) => e.id);
  const toWaitlist = pending.slice(available).map((e) => e.id);

  if (toApprove.length > 0) {
    await admin
      .from('tournament_entries')
      .update({ status: 'active' })
      .in('id', toApprove);
  }
  if (toWaitlist.length > 0) {
    await admin
      .from('tournament_entries')
      .update({ status: 'waitlisted' })
      .in('id', toWaitlist);
  }

  const tSlug = tData.slug ?? cat.tournament_id;
  revalidatePath(`/tournaments/${tSlug}/registrations`);
  revalidatePath(`/tournaments/${tSlug}`);
  return { success: true, approved: toApprove.length, waitlisted: toWaitlist.length };
}

// ── Doubles: register with partner ────────────────────────────────────────────

export async function registerDoublesAction(categoryId: string, partnerUsername: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'You must be logged in to register.' };

  const admin = createAdminClient();

  // Load category + tournament
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
  if (!['doubles', 'mixed_doubles'].includes(cat.play_format)) {
    return { error: 'This action is only for doubles and mixed doubles.' };
  }

  // Find partner by username
  const { data: partner } = await admin
    .from('players')
    .select('id, full_name, email')
    .eq('username', partnerUsername.toLowerCase().replace(/^@/, ''))
    .maybeSingle();

  if (!partner) return { error: `Player "@${partnerUsername}" not found.` };
  if (partner.id === user.id) return { error: "You can't partner with yourself." };

  // Duplicate checks
  const { data: myExisting } = await admin
    .from('tournament_entries')
    .select('id, status')
    .eq('category_id', categoryId)
    .eq('player_id', user.id)
    .not('status', 'eq', 'withdrawn')
    .maybeSingle();

  if (myExisting) {
    const label = myExisting.status === 'provisional' ? 'already have a pending invite' : 'already registered';
    return { error: `You are ${label} in this category.` };
  }

  const { data: partnerExisting } = await admin
    .from('tournament_entries')
    .select('id, status')
    .eq('category_id', categoryId)
    .eq('player_id', partner.id)
    .not('status', 'eq', 'withdrawn')
    .maybeSingle();

  if (partnerExisting) return { error: `${partner.full_name} is already registered in this category.` };

  // Check if partner is already someone else's partner in a provisional entry
  const { data: partnerInvited } = await admin
    .from('tournament_entries')
    .select('id')
    .eq('category_id', categoryId)
    .eq('partner_id', partner.id)
    .eq('status', 'provisional')
    .maybeSingle();

  if (partnerInvited) return { error: `${partner.full_name} has already been invited by another player.` };

  // Capacity check (count active + pending — not provisional, those haven't confirmed yet)
  const { count: activeCount } = await admin
    .from('tournament_entries')
    .select('id', { count: 'exact', head: true })
    .eq('category_id', categoryId)
    .in('status', ['active', 'pending', 'waitlisted']);

  const isFull = cat.max_entries !== null && (activeCount ?? 0) >= cat.max_entries;

  // Create provisional entry — partner must confirm before it becomes active/pending
  const { error: insertErr } = await admin
    .from('tournament_entries')
    .insert({
      tournament_id: tournament.id,
      category_id: categoryId,
      player_id: user.id,
      partner_id: partner.id,
      status: 'provisional',
    });

  if (insertErr) return { error: 'Failed to send invite. Please try again.' };

  // Look up the inviter's name to include in the email
  const { data: inviter } = await admin
    .from('players')
    .select('full_name')
    .eq('id', user.id)
    .single();

  // Notify the partner via email (fire-and-forget)
  void sendPartnerInviteNotification({
    partnerEmail: partner.email,
    partnerName: partner.full_name,
    inviterName: inviter?.full_name ?? 'A player',
    tournamentName: tournament.name,
    categoryName: cat.name,
  });

  // If category is full, note it — partner will be put on waitlist on confirm
  revalidatePath(`/events/${tournament.slug}`);
  revalidatePath('/dashboard');
  return { success: true, partnerName: partner.full_name, willBeWaitlisted: isFull };
}

// ── Doubles: partner confirm / decline ────────────────────────────────────────

export async function confirmPartnerInviteAction(entryId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'You must be logged in.' };

  const admin = createAdminClient();

  const { data: entry } = await admin
    .from('tournament_entries')
    .select('id, player_id, partner_id, category_id, tournament_id, status, tournaments!tournament_id(slug)')
    .eq('id', entryId)
    .single();

  if (!entry) return { error: 'Invite not found.' };
  if (entry.partner_id !== user.id) return { error: 'This invite is not for you.' };
  if (entry.status !== 'provisional') return { error: 'Invite is no longer pending.' };

  const tSlug = (entry.tournaments as { slug: string } | null)?.slug ?? entry.tournament_id;

  // Check capacity
  const { data: cat } = await admin
    .from('tournament_categories')
    .select('max_entries, tournaments(auto_approve_entries)')
    .eq('id', entry.category_id)
    .single();

  const { count: activeCount } = await admin
    .from('tournament_entries')
    .select('id', { count: 'exact', head: true })
    .eq('category_id', entry.category_id)
    .in('status', ['active', 'pending']);

  const isFull = cat?.max_entries != null && (activeCount ?? 0) >= cat.max_entries;
  const autoApprove = (cat?.tournaments as { auto_approve_entries: boolean } | null)?.auto_approve_entries ?? false;

  let newStatus: 'active' | 'pending' | 'waitlisted';
  if (isFull) newStatus = 'waitlisted';
  else if (autoApprove) newStatus = 'active';
  else newStatus = 'pending';

  await admin
    .from('tournament_entries')
    .update({ status: newStatus })
    .eq('id', entryId);

  revalidatePath(`/events/${tSlug}`);
  revalidatePath('/dashboard');
  return { success: true, status: newStatus };
}

export async function declinePartnerInviteAction(entryId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'You must be logged in.' };

  const admin = createAdminClient();

  const { data: entry } = await admin
    .from('tournament_entries')
    .select('id, partner_id, status, tournament_id, tournaments!tournament_id(slug)')
    .eq('id', entryId)
    .single();

  if (!entry) return { error: 'Invite not found.' };
  if (entry.partner_id !== user.id) return { error: 'This invite is not for you.' };
  if (entry.status !== 'provisional') return { error: 'Invite is no longer pending.' };

  const tSlug = (entry.tournaments as { slug: string } | null)?.slug ?? entry.tournament_id;

  await admin.from('tournament_entries').update({ status: 'withdrawn' }).eq('id', entryId);

  revalidatePath(`/events/${tSlug}`);
  revalidatePath('/dashboard');
  return { success: true };
}

// ── Manager: remove entry (any non-withdrawn status) ──────────────────────────

export async function removeEntryAction(entryId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated.' };

  const entry = await assertManagerForEntry(entryId, user.id);
  if (!entry) return { error: 'Permission denied.' };
  if (entry.status === 'withdrawn') return { error: 'Already withdrawn.' };

  const admin = createAdminClient();
  const wasActive = entry.status === 'active';

  await admin.from('tournament_entries').update({ status: 'withdrawn' }).eq('id', entryId);

  if (wasActive) await promoteWaitlisted(entry.category_id);

  revalidatePath(`/tournaments/${entry.tournamentSlug}/registrations`);
  revalidatePath(`/tournaments/${entry.tournamentSlug}`);
  return { success: true };
}

// ── Manager: set seed ─────────────────────────────────────────────────────────

export async function updateEntrySeedAction(entryId: string, seed: number | null) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated.' };

  const entry = await assertManagerForEntry(entryId, user.id);
  if (!entry) return { error: 'Permission denied.' };

  const admin = createAdminClient();
  await admin.from('tournament_entries').update({ seed }).eq('id', entryId);

  revalidatePath(`/tournaments/${entry.tournamentSlug}/registrations`);
  return { success: true };
}

// ── Player: get my registrations + pending partner invites ────────────────────

export async function getMyEntries() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const admin = createAdminClient();
  const { data } = await admin
    .from('tournament_entries')
    .select(`
      id, status, registered_at, partner_id,
      tournament_categories!category_id(id, name, play_format, draw_format),
      tournaments!tournament_id(id, name, slug, start_date, status),
      partner:players!partner_id(full_name, username)
    `)
    .eq('player_id', user.id)
    .not('status', 'eq', 'withdrawn')
    .order('registered_at', { ascending: false });

  return data ?? [];
}

/** Invites where the current user is the partner (needs to confirm/decline). */
export async function getMyPartnerInvites() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const admin = createAdminClient();
  const { data } = await admin
    .from('tournament_entries')
    .select(`
      id, status, registered_at,
      tournament_categories!category_id(id, name, play_format),
      tournaments!tournament_id(id, name, slug, start_date),
      initiator:players!player_id(full_name, username)
    `)
    .eq('partner_id', user.id)
    .eq('status', 'provisional')
    .order('registered_at', { ascending: false });

  return data ?? [];
}
