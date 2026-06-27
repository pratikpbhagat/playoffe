import { createAdminClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { getMatchesForCategory } from '@/lib/actions/draws';

interface RouteParams {
  params: Promise<{ id: string; catId: string }>;
}

function escapeCsv(value: string | number | null | undefined): string {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function row(...cells: (string | number | null | undefined)[]): string {
  return cells.map(escapeCsv).join(',');
}

export async function GET(_req: Request, { params }: RouteParams) {
  const { id: tournamentSlug, catId: catSlug } = await params;
  const admin = createAdminClient();

  // Resolve tournament
  const { data: tournament } = await admin
    .from('tournaments')
    .select('id, name')
    .eq('slug', tournamentSlug)
    .single();
  if (!tournament) return new NextResponse('Not found', { status: 404 });

  // Resolve category
  const { data: cat } = await admin
    .from('tournament_categories')
    .select('id, name, draw_format, status')
    .eq('slug', catSlug)
    .eq('tournament_id', tournament.id)
    .single();
  if (!cat) return new NextResponse('Not found', { status: 404 });

  const matches = await getMatchesForCategory(cat.id);

  const isElimination = cat.draw_format === 'single_elimination';
  const isRoundRobin =
    cat.draw_format === 'round_robin' ||
    cat.draw_format === 'group_stage_knockout';

  let lines: string[] = [];
  const safeName = `${tournament.name} - ${cat.name}`.replace(/[^a-z0-9 _-]/gi, '');

  if (isRoundRobin) {
    // Build standings table (same algorithm as StandingsTable.tsx)
    interface Standing {
      entryId: string;
      playerName: string;
      played: number;
      wins: number;
      losses: number;
      setsWon: number;
      setsLost: number;
      pointsWon: number;
      pointsLost: number;
    }

    const map = new Map<string, Standing>();

    function getOrCreate(entry: NonNullable<(typeof matches)[0]['entry_a']>): Standing {
      if (!map.has(entry.id)) {
        const displayName = entry.partner_name
          ? `${entry.player_name} / ${entry.partner_name}`
          : entry.player_name;
        map.set(entry.id, {
          entryId: entry.id,
          playerName: displayName,
          played: 0,
          wins: 0,
          losses: 0,
          setsWon: 0,
          setsLost: 0,
          pointsWon: 0,
          pointsLost: 0,
        });
      }
      return map.get(entry.id)!;
    }

    for (const m of matches) {
      if (m.status !== 'completed' && m.status !== 'walkover') continue;
      if (!m.entry_a || !m.entry_b) continue;

      const a = getOrCreate(m.entry_a);
      const b = getOrCreate(m.entry_b);

      a.played++;
      b.played++;

      if (m.winner_entry_id === m.entry_a.id) {
        a.wins++;
        b.losses++;
      } else if (m.winner_entry_id === m.entry_b.id) {
        b.wins++;
        a.losses++;
      }

      if (Array.isArray(m.sets)) {
        for (const set of m.sets as { score_a: number; score_b: number }[]) {
          a.setsWon += set.score_a > set.score_b ? 1 : 0;
          a.setsLost += set.score_b > set.score_a ? 1 : 0;
          b.setsWon += set.score_b > set.score_a ? 1 : 0;
          b.setsLost += set.score_a > set.score_b ? 1 : 0;
          a.pointsWon += set.score_a;
          a.pointsLost += set.score_b;
          b.pointsWon += set.score_b;
          b.pointsLost += set.score_a;
        }
      }
    }

    const sorted = [...map.values()].sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      const sdA = a.setsWon - a.setsLost;
      const sdB = b.setsWon - b.setsLost;
      if (sdB !== sdA) return sdB - sdA;
      return (b.pointsWon - b.pointsLost) - (a.pointsWon - a.pointsLost);
    });

    lines.push(row('Rank', 'Player', 'Played', 'W', 'L', 'Sets Won', 'Sets Lost', 'Points Won', 'Points Lost'));
    sorted.forEach((s, i) => {
      lines.push(row(i + 1, s.playerName, s.played, s.wins, s.losses, s.setsWon, s.setsLost, s.pointsWon, s.pointsLost));
    });
  } else if (isElimination) {
    // For elimination draws, report final results by round (highest round = furthest)
    const completedMatches = matches.filter(
      (m) => (m.status === 'completed' || m.status === 'walkover') && m.entry_a && m.entry_b,
    );

    // Track how far each entry got
    const entryRound = new Map<string, { round: number; won: boolean; name: string }>();

    for (const m of completedMatches) {
      if (!m.entry_a || !m.entry_b) continue;
      const aName = m.entry_a.partner_name
        ? `${m.entry_a.player_name} / ${m.entry_a.partner_name}`
        : m.entry_a.player_name;
      const bName = m.entry_b.partner_name
        ? `${m.entry_b.player_name} / ${m.entry_b.partner_name}`
        : m.entry_b.player_name;

      const aWon = m.winner_entry_id === m.entry_a.id;
      const bWon = m.winner_entry_id === m.entry_b.id;

      const prev = entryRound.get(m.entry_a.id);
      if (!prev || m.round > prev.round) {
        entryRound.set(m.entry_a.id, { round: m.round, won: aWon, name: aName });
      }
      const prevB = entryRound.get(m.entry_b.id);
      if (!prevB || m.round > prevB.round) {
        entryRound.set(m.entry_b.id, { round: m.round, won: bWon, name: bName });
      }
    }

    const sorted = [...entryRound.values()].sort((a, b) => {
      if (b.round !== a.round) return b.round - a.round;
      return Number(b.won) - Number(a.won);
    });

    lines.push(row('Finish', 'Player', 'Last Round Reached'));
    let rank = 1;
    for (const entry of sorted) {
      const finish = rank === 1 && entry.won ? '🥇 Champion' : rank === 2 ? 'Finalist' : `Round ${entry.round}`;
      lines.push(row(finish, entry.name, `Round ${entry.round}`));
      rank++;
    }
  } else {
    // Generic: just list matches
    lines.push(row('Round', 'Player A', 'Player B', 'Winner', 'Score'));
    for (const m of matches) {
      if (!m.entry_a || !m.entry_b) continue;
      const aName = m.entry_a.partner_name
        ? `${m.entry_a.player_name} / ${m.entry_a.partner_name}`
        : m.entry_a.player_name;
      const bName = m.entry_b.partner_name
        ? `${m.entry_b.player_name} / ${m.entry_b.partner_name}`
        : m.entry_b.player_name;
      const winner =
        m.winner_entry_id === m.entry_a.id
          ? aName
          : m.winner_entry_id === m.entry_b.id
            ? bName
            : '';
      const score = Array.isArray(m.sets)
        ? (m.sets as { score_a: number; score_b: number }[]).map((s) => `${s.score_a}-${s.score_b}`).join(' ')
        : '';
      lines.push(row(m.round_name ?? `Round ${m.round}`, aName, bName, winner, score));
    }
  }

  const csv = lines.join('\r\n');
  const filename = `${safeName} Standings.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
