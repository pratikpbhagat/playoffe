'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { createTournamentSchema, type CreateTournamentInput } from '@pickleball/shared';

export async function createTournamentAction(
  input: CreateTournamentInput & { club_id: string },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { club_id, ...rest } = input;

  if (!club_id) return { error: 'Please select a club.' };

  const parsed = createTournamentSchema.safeParse(rest);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const admin = createAdminClient();

  // Verify caller manages this club
  const { data: mgr } = await admin
    .from('club_managers')
    .select('role')
    .eq('club_id', club_id)
    .eq('player_id', user.id)
    .maybeSingle();

  if (!mgr) {
    return { error: 'You do not have permission to create tournaments for this club.' };
  }

  const { data: tournament, error } = await admin
    .from('tournaments')
    // display_code is set by a BEFORE INSERT trigger; pass empty string as placeholder
    .insert({ ...parsed.data, club_id, created_by: user.id, display_code: '', slug: '' })
    .select('id, slug')
    .single();

  if (error || !tournament) {
    return { error: 'Failed to create tournament. Please try again.' };
  }

  redirect(`/tournaments/${tournament.slug}`);
}

export async function updateTournamentAction(
  tournamentId: string,
  input: Partial<CreateTournamentInput> & { auto_approve_entries?: boolean },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const admin = createAdminClient();

  const { data: tournament } = await admin
    .from('tournaments')
    .select('club_id, slug')
    .eq('id', tournamentId)
    .single();

  if (!tournament) return { error: 'Tournament not found' };

  const { data: mgr } = await admin
    .from('club_managers')
    .select('role')
    .eq('club_id', tournament.club_id)
    .eq('player_id', user.id)
    .maybeSingle();

  if (!mgr) return { error: 'Permission denied' };

  // Validate dates if both are present
  if (input.start_date && input.end_date && input.end_date < input.start_date) {
    return { error: 'End date must be on or after start date' };
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.name !== undefined) update.name = input.name;
  if (input.description !== undefined) update.description = input.description ?? null;
  if (input.venue !== undefined) update.venue = input.venue ?? null;
  if (input.start_date !== undefined) update.start_date = input.start_date;
  if (input.end_date !== undefined) update.end_date = input.end_date;
  if (input.court_count !== undefined) update.court_count = input.court_count;
  if (input.registration_deadline !== undefined) update.registration_deadline = input.registration_deadline ?? null;
  if (input.max_participants !== undefined) update.max_participants = input.max_participants ?? null;
  if (input.auto_approve_entries !== undefined) update.auto_approve_entries = input.auto_approve_entries;
  if (input.scoring_format !== undefined) update.scoring_format = input.scoring_format;
  if (input.num_sets !== undefined) update.num_sets = input.num_sets;
  if (input.points_per_set !== undefined) update.points_per_set = input.points_per_set;
  if (input.win_by !== undefined) update.win_by = input.win_by;
  if ('deuce_cap' in input) update.deuce_cap = input.deuce_cap ?? null;

  const { error } = await admin.from('tournaments').update(update).eq('id', tournamentId);
  if (error) return { error: 'Failed to update tournament. Please try again.' };

  revalidatePath(`/tournaments/${tournament.slug}`);
  redirect(`/tournaments/${tournament.slug}`);
}

/**
 * Returns tournaments for all clubs the current user manages.
 * @param limit  Max rows to return. Omit (or pass undefined) for no limit (use on full listing pages).
 *               Pass a small number (e.g. 5) for dashboard tiles.
 */
export async function getMyTournaments(limit?: number) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const admin = createAdminClient();

  // 1. Clubs this user manages (owner or manager)
  const { data: managed } = await admin
    .from('club_managers')
    .select('club_id')
    .eq('player_id', user.id);

  const clubIds = (managed ?? []).map((m) => m.club_id as string);
  if (clubIds.length === 0) return [];

  // 2. All tournaments belonging to those clubs
  let query = admin
    .from('tournaments')
    .select('id, name, slug, status, start_date, end_date, display_code, clubs(id, name)')
    .in('club_id', clubIds)
    .order('start_date', { ascending: false });

  if (limit !== undefined) {
    query = query.limit(limit);
  }

  const { data } = await query;
  return data ?? [];
}

export async function getTournament(id: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from('tournaments')
    .select('*, clubs(id, name, brand_primary_color), tournament_categories(*)')
    .eq('id', id)
    .single();
  return data;
}

export type TournamentStatus =
  | 'draft'
  | 'registration_open'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export async function updateTournamentStatusAction(
  tournamentId: string,
  status: TournamentStatus,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const admin = createAdminClient();

  const { data: tournament } = await admin
    .from('tournaments')
    .select('club_id')
    .eq('id', tournamentId)
    .single();

  if (!tournament) return { error: 'Tournament not found' };

  const { data: mgr } = await admin
    .from('club_managers')
    .select('role')
    .eq('club_id', tournament.club_id)
    .eq('player_id', user.id)
    .maybeSingle();

  if (!mgr) return { error: 'Permission denied' };

  const { error } = await admin
    .from('tournaments')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', tournamentId);

  if (error) return { error: 'Failed to update status' };
  return { success: true };
}

// ── Clone a tournament ────────────────────────────────────────────────────────
// Creates a new draft tournament with the same settings and categories.
// Dates are cleared so the organiser fills them in fresh.
export async function cloneTournamentAction(tournamentId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const admin = createAdminClient();

  const { data: src } = await admin
    .from('tournaments')
    .select('*, tournament_categories(*)')
    .eq('id', tournamentId)
    .single();
  if (!src) return { error: 'Tournament not found' };

  const { data: mgr } = await admin
    .from('club_managers')
    .select('role')
    .eq('club_id', src.club_id)
    .eq('player_id', user.id)
    .maybeSingle();
  if (!mgr) return { error: 'Permission denied' };

  // Insert cloned tournament — triggers auto-generate display_code + slug
  const { data: newT, error: tErr } = await admin
    .from('tournaments')
    .insert({
      club_id: src.club_id,
      name: `Copy of ${src.name}`,
      description: src.description,
      venue: src.venue,
      start_date: src.start_date,
      end_date: src.end_date,
      status: 'draft',
      court_count: src.court_count,
      registration_deadline: null,
      max_participants: src.max_participants,
      social_post_triggers: src.social_post_triggers,
      created_by: user.id,
      display_code: '',
      slug: '',
    })
    .select('id, slug')
    .single();

  if (tErr || !newT) return { error: 'Failed to clone tournament' };

  // Clone each category (status reset to pending, winners cleared)
  const categories = (src.tournament_categories ?? []) as Array<{
    name: string; type: string; play_format: string; draw_format: string;
    max_entries: number | null; min_age: number | null; max_age: number | null;
    skill_levels: string[];
  }>;

  function toSlug(name: string) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }

  if (categories.length > 0) {
    // Deduplicate slugs: if two categories share a name, append -2, -3, …
    const slugCounts = new Map<string, number>();
    const rows = categories.map((c) => {
      const base = toSlug(c.name);
      const count = (slugCounts.get(base) ?? 0) + 1;
      slugCounts.set(base, count);
      const slug = count === 1 ? base : `${base}-${count}`;
      return {
        tournament_id: newT.id,
        name: c.name,
        slug,
        type: c.type,
        play_format: c.play_format,
        draw_format: c.draw_format,
        status: 'pending',
        max_entries: c.max_entries,
        min_age: c.min_age,
        max_age: c.max_age,
        skill_levels: c.skill_levels,
      };
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin.from('tournament_categories') as any).insert(rows);
  }

  revalidatePath('/dashboard');
  redirect(`/tournaments/${newT.slug}`);
}
