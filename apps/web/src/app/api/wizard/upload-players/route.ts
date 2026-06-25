import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, getCurrentUser } from '@/lib/supabase/server';

export interface UploadPlayersRequest {
  tournamentId: string;
  categoryId: string;
  players: Array<{ name: string; email?: string }>;
}

export interface UploadPlayersResponse {
  imported: number;
  skipped: number;
  errors: string[];
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const body = (await req.json()) as UploadPlayersRequest;
    const { tournamentId, categoryId, players } = body;

    if (!tournamentId || !categoryId || !Array.isArray(players)) {
      return NextResponse.json({ error: 'tournamentId, categoryId, and players are required' }, { status: 400 });
    }

    const admin = createAdminClient();

    // Verify user manages this tournament's club
    const { data: tournament } = await admin
      .from('tournaments')
      .select('club_id')
      .eq('id', tournamentId)
      .single();

    if (!tournament) return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });

    const { data: mgr } = await admin
      .from('club_managers')
      .select('role')
      .eq('club_id', (tournament as { club_id: string }).club_id)
      .eq('player_id', user.id)
      .maybeSingle();

    if (!mgr) return NextResponse.json({ error: 'Permission denied' }, { status: 403 });

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const p of players) {
      if (!p.name?.trim()) { skipped++; continue; }

      try {
        let playerId: string | null = null;

        // Look up by email first, then by full_name
        if (p.email?.trim()) {
          const { data: byEmail } = await admin
            .from('players')
            .select('id')
            .eq('email', p.email.trim().toLowerCase())
            .maybeSingle();
          playerId = (byEmail as { id: string } | null)?.id ?? null;
        }

        if (!playerId) {
          const { data: byName } = await admin
            .from('players')
            .select('id')
            .ilike('full_name', p.name.trim())
            .maybeSingle();
          playerId = (byName as { id: string } | null)?.id ?? null;
        }

        if (!playerId) {
          errors.push(`Player not found: ${p.name}${p.email ? ` (${p.email})` : ''}`);
          skipped++;
          continue;
        }

        // Skip if already registered in this category
        const { data: existing } = await admin
          .from('tournament_entries')
          .select('id')
          .eq('tournament_id', tournamentId)
          .eq('category_id', categoryId)
          .eq('player_id', playerId)
          .maybeSingle();

        if (existing) { skipped++; continue; }

        await admin.from('tournament_entries').insert({
          tournament_id: tournamentId,
          category_id: categoryId,
          player_id: playerId,
          status: 'active',
        });

        imported++;
      } catch (err) {
        console.error(`[wizard/upload-players] failed importing ${p.name}:`, err);
        errors.push(`Could not import ${p.name} — please try again or add them manually.`);
        skipped++;
      }
    }

    return NextResponse.json({ imported, skipped, errors } satisfies UploadPlayersResponse);
  } catch (err) {
    console.error('[wizard/upload-players] error:', err);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
