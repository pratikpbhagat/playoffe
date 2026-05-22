'use server';

import { revalidatePath } from 'next/cache';
import { createClient, createAdminClient } from '@/lib/supabase/server';

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

/** Promote the oldest waitlisted entry in a category to active. */
async function promoteWaitlisted(categoryId: string) {
  const admin = createAdminClient();
  const { data: next } = await admin
    .from('tournament_entries')
    .select('id')
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
    .select('id, category_id, tournament_id, status, tournaments(club_id, slug)')
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
    .select('max_entries')
    .eq('id', entry.category_id)
    .single();

  const activeCount = await getActiveCount(entry.category_id);
  const newStatus =
    cat?.max_entries && activeCount >= cat.max_entries ? 'waitlisted' : 'active';

  await admin
    .from('tournament_entries')
    .update({ status: newStatus })
    .eq('id', entryId);

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
  await admin
    .from('tournament_entries')
    .update({ status: 'withdrawn' })
    .eq('id', entryId);

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

// ── Player: get my registrations ──────────────────────────────────────────────

export async function getMyEntries() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const admin = createAdminClient();
  const { data } = await admin
    .from('tournament_entries')
    .select(`
      id, status, registered_at,
      tournament_categories!category_id(id, name, play_format, draw_format),
      tournaments!tournament_id(id, name, start_date, status)
    `)
    .eq('player_id', user.id)
    .not('status', 'eq', 'withdrawn')
    .order('registered_at', { ascending: false });

  return data ?? [];
}
