'use server';

import { revalidatePath } from 'next/cache';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { generateDraw } from '@pickleball/draw-engine';
import type { DrawConfig, DrawEntry } from '@pickleball/shared';

// ── Auth guard ────────────────────────────────────────────────────────────────
async function assertCategoryManager(categoryId: string, userId: string) {
  const admin = createAdminClient();

  const { data: cat } = await admin
    .from('tournament_categories')
    .select('id, tournament_id, draw_format, slug, tournaments!inner(club_id, slug)')
    .eq('id', categoryId)
    .single();
  if (!cat) return null;

  const tData = cat.tournaments as { club_id: string; slug: string };
  const clubId = tData.club_id;

  const { data: mgr } = await admin
    .from('club_managers')
    .select('role')
    .eq('club_id', clubId)
    .eq('player_id', userId)
    .maybeSingle();

  return mgr ? cat : null;
}

// ── Generate draw ─────────────────────────────────────────────────────────────
export async function generateDrawAction(categoryId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const admin = createAdminClient();
  const cat = await assertCategoryManager(categoryId, user.id);
  if (!cat) return { error: 'Permission denied' };

  // Fetch active entries with player info
  const { data: entries, error: entryErr } = await admin
    .from('tournament_entries')
    .select(
      'id, seed, players!player_id(id, full_name, username, global_stats(current_rating))',
    )
    .eq('category_id', categoryId)
    .eq('status', 'active');

  if (entryErr || !entries) return { error: 'Failed to fetch entries' };
  if (entries.length < 2) return { error: 'Need at least 2 entries to generate a draw' };

  // Map to DrawEntry[]
  const drawEntries: DrawEntry[] = entries.map((e) => {
    const player = e.players as {
      id: string;
      full_name: string;
      username: string;
      global_stats: { current_rating: number } | null;
    } | null;
    return {
      entry_id: e.id,
      player_ids: player ? [player.id] : [],
      display_name: player?.full_name ?? 'Unknown',
      seed: e.seed,
      rating: player?.global_stats?.current_rating ?? 3.5,
    };
  });

  // Generate the draw
  const config: DrawConfig = {
    format: cat.draw_format as DrawConfig['format'],
    entries: drawEntries,
    category_id: categoryId,
  };

  let draw;
  try {
    draw = generateDraw(config);
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to generate draw' };
  }

  // Clear any existing matches first
  await admin.from('matches').delete().eq('category_id', categoryId);

  // Bulk insert all matches (bracket_position is 0-indexed within each round)
  const matchInserts = draw.rounds.flatMap((r) =>
    r.matches.map((m, positionInRound) => ({
      id: m.id,
      tournament_id: cat.tournament_id,
      category_id: categoryId,
      round: m.round,
      round_name: m.round_name,
      group_name: m.group_name,
      entry_a_id: m.entry_a?.entry_id ?? null,
      entry_b_id: m.entry_b?.entry_id ?? null,
      status: 'scheduled' as const,
      sets: [],
      bracket_position: positionInRound,
    })),
  );

  const { error: insertErr } = await admin.from('matches').insert(matchInserts);
  if (insertErr) return { error: 'Failed to save draw matches' };

  // Auto-advance byes for elimination formats
  const isElimination =
    cat.draw_format === 'single_elimination' || cat.draw_format === 'double_elimination';
  if (isElimination) {
    const byeMatches = matchInserts.filter(
      (m) => m.entry_a_id === null || m.entry_b_id === null,
    );
    for (const bye of byeMatches) {
      const winnerEntryId = bye.entry_a_id ?? bye.entry_b_id;
      if (!winnerEntryId) continue;

      await admin
        .from('matches')
        .update({ status: 'walkover', winner_entry_id: winnerEntryId, completed_at: new Date().toISOString() })
        .eq('id', bye.id);

      const nextPos = Math.floor(bye.bracket_position / 2);
      const slot = bye.bracket_position % 2 === 0 ? 'entry_a_id' : 'entry_b_id';
      const { data: nextMatch } = await admin
        .from('matches')
        .select('id')
        .eq('category_id', categoryId)
        .eq('round', bye.round + 1)
        .eq('bracket_position', nextPos)
        .maybeSingle();
      if (nextMatch) {
        await admin.from('matches').update({ [slot]: winnerEntryId }).eq('id', nextMatch.id);
      }
    }
  }

  // Update category status
  await admin
    .from('tournament_categories')
    .update({ status: 'draw_generated' })
    .eq('id', categoryId);

  const tSlug = (cat.tournaments as { club_id: string; slug: string }).slug;
  revalidatePath(`/tournaments/${tSlug}/categories/${cat.slug}`);
  return { success: true, matchCount: matchInserts.length };
}

// ── Clear draw (for regenerate) ───────────────────────────────────────────────
export async function clearDrawAction(categoryId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const cat = await assertCategoryManager(categoryId, user.id);
  if (!cat) return { error: 'Permission denied' };

  const admin = createAdminClient();
  await admin.from('matches').delete().eq('category_id', categoryId);
  await admin
    .from('tournament_categories')
    .update({ status: 'registration' })
    .eq('id', categoryId);

  const tSlugClear = (cat.tournaments as { club_id: string; slug: string }).slug;
  revalidatePath(`/tournaments/${tSlugClear}/categories/${cat.slug}`);
  return { success: true };
}

// ── Fetch matches with player details ─────────────────────────────────────────
export type MatchWithPlayers = {
  id: string;
  round: number;
  round_name: string | null;
  group_name: string | null;
  status: string;
  winner_entry_id: string | null;
  sets: unknown;
  entry_a: {
    id: string;
    seed: number | null;
    player_name: string;
    player_username: string;
  } | null;
  entry_b: {
    id: string;
    seed: number | null;
    player_name: string;
    player_username: string;
  } | null;
};

export async function getMatchesForCategory(categoryId: string): Promise<MatchWithPlayers[]> {
  const admin = createAdminClient();

  const { data } = await admin
    .from('matches')
    .select(
      `id, round, round_name, group_name, status, winner_entry_id, sets,
       ea:tournament_entries!entry_a_id(id, seed, players!player_id(full_name, username)),
       eb:tournament_entries!entry_b_id(id, seed, players!player_id(full_name, username))`,
    )
    .eq('category_id', categoryId)
    .order('round', { ascending: true })
    .order('id', { ascending: true });

  if (!data) return [];

  return data.map((m) => {
    const ea = m.ea as { id: string; seed: number | null; players: { full_name: string; username: string } | null } | null;
    const eb = m.eb as { id: string; seed: number | null; players: { full_name: string; username: string } | null } | null;

    return {
      id: m.id,
      round: m.round,
      round_name: m.round_name,
      group_name: m.group_name,
      status: m.status,
      winner_entry_id: m.winner_entry_id,
      sets: m.sets,
      entry_a: ea
        ? {
            id: ea.id,
            seed: ea.seed,
            player_name: ea.players?.full_name ?? 'Unknown',
            player_username: ea.players?.username ?? '',
          }
        : null,
      entry_b: eb
        ? {
            id: eb.id,
            seed: eb.seed,
            player_name: eb.players?.full_name ?? 'Unknown',
            player_username: eb.players?.username ?? '',
          }
        : null,
    };
  });
}
