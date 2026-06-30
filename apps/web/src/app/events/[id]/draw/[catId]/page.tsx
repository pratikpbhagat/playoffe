import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createAdminClient, createClient, getCurrentUser } from '@/lib/supabase/server';
import { AppNav } from '@/components/layout/AppNav';
import { BracketView } from '@/components/tournaments/BracketView';
import { StandingsTable, TeamStandingsTable } from '@/components/tournaments/StandingsTable';
import { TeamBracketView } from '@/components/tournaments/TeamBracketView';
import { PrintButton } from '@/components/ui/PrintButton';
import { getMatchesForCategory, getTiesForCategory } from '@/lib/actions/draws';
import type { Metadata } from 'next';

interface Props {
  params: Promise<{ id: string; catId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id: tournamentSlug, catId: catSlug } = await params;
  const admin = createAdminClient();
  const { data: cat } = await admin
    .from('tournament_categories')
    .select('name, tournaments(name, slug)')
    .eq('slug', catSlug)
    .eq('tournaments.slug', tournamentSlug)
    .single();
  if (!cat) return { title: 'Draw' };
  const tName = (cat.tournaments as { name: string } | null)?.name ?? '';
  return { title: `${cat.name} Draw · ${tName}` };
}

export default async function PublicDrawPage({ params }: Props) {
  const { id: tournamentSlug, catId: catSlug } = await params;

  const admin = createAdminClient();

  // Look up tournament by slug (include club_id for manager check)
  const { data: tournament } = await admin
    .from('tournaments')
    .select('id, name, slug, club_id')
    .eq('slug', tournamentSlug)
    .single();

  if (!tournament) notFound();

  // Check if the current user is a club manager for this tournament
  // Managers get clickable match tiles; everyone else gets read-only view
  const supabase = await createClient();
  const user = await getCurrentUser();
  let isManager = false;
  if (user) {
    const { data: mgr } = await admin
      .from('club_managers')
      .select('role')
      .eq('club_id', (tournament as { club_id: string }).club_id)
      .eq('player_id', user.id)
      .maybeSingle();
    isManager = !!mgr;
  }

  // Look up category by slug + tournament_id
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: cat } = await (admin as any)
    .from('tournament_categories')
    .select('id, name, draw_format, play_format, status, tournament_id, advance_per_group')
    .eq('slug', catSlug)
    .eq('tournament_id', tournament.id)
    .single() as { data: { id: string; name: string; draw_format: string; play_format: string; status: string; tournament_id: string; advance_per_group: number } | null };

  if (!cat) notFound();

  // Only show if draw is generated or later
  if (!['draw_generated', 'in_progress', 'completed'].includes(cat.status)) notFound();

  const isTeamEvent = cat.play_format === 'team_event';
  const matches = isTeamEvent ? [] : await getMatchesForCategory(cat.id);
  const ties = isTeamEvent ? await getTiesForCategory(cat.id) : [];

  // Find the winner: the last match/tie with a winner (final/grand final)
  const completedMatches = matches.filter((m) => m.status === 'completed' || m.status === 'walkover');
  const finalMatch = completedMatches.length > 0
    ? completedMatches.reduce((a, b) => (b.round > a.round ? b : a), completedMatches[0])
    : null;
  const winnerEntry = finalMatch?.winner_entry_id
    ? (finalMatch.winner_entry_id === finalMatch.entry_a?.id ? finalMatch.entry_a : finalMatch.entry_b)
    : null;

  const finalKnockoutTies = ties.filter((t) => t.group_name === null && t.status === 'completed' && t.winner_team_id);
  const finalTie = finalKnockoutTies.length > 0
    ? finalKnockoutTies.reduce((a, b) => (b.round > a.round ? b : a), finalKnockoutTies[0])
    : null;
  const winnerTeamName = finalTie
    ? (finalTie.winner_team_id === finalTie.team_a?.id ? finalTie.team_a?.name : finalTie.team_b?.name)
    : null;

  const isCompleted = cat.status === 'completed';

  return (
    <div className="min-h-screen bg-surface">
      <AppNav />

      <main className="mx-auto max-w-6xl px-6 py-10">
        {/* Print-only header — hidden on screen */}
        <div data-print-only className="hidden mb-6 border-b pb-4">
          <p className="text-xl font-bold">{tournament.name}</p>
          <p className="text-sm text-slate-500">{cat.name} · Draw</p>
        </div>

        {/* Breadcrumb */}
        <nav className="mb-6 flex items-center gap-2 text-xs text-slate-500 sm:text-sm min-w-0" data-print-hide>
          {/* "Tournaments" crumb — hidden on mobile to save space */}
          <Link href="/events" className="hidden sm:inline hover:text-slate-300 transition-colors shrink-0">Tournaments</Link>
          <span className="hidden sm:inline">/</span>
          <Link href={`/events/${tournamentSlug}`} className="hover:text-slate-300 transition-colors truncate min-w-0 shrink">
            {tournament.name}
          </Link>
          <span className="shrink-0">/</span>
          <span className="text-slate-400 truncate min-w-0 shrink">{cat.name} Draw</span>
        </nav>

        <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="mb-1 text-xl font-bold text-white">{cat.name}</h1>
            <p className="text-sm text-slate-500">{tournament.name}</p>
          </div>
          <div className="flex items-center gap-2" data-print-hide>
            <a
              href={`/api/tournaments/${tournamentSlug}/categories/${catSlug}/standings.csv`}
              download
              className="flex items-center gap-1.5 rounded-lg border border-surface-border px-3 py-2 text-xs font-medium text-slate-400 hover:bg-surface hover:text-white transition-colors"
            >
              ⬇ Export CSV
            </a>
            <PrintButton />
          </div>
        </div>

        {/* Winner banner — shown when category is completed */}
        {isCompleted && (winnerEntry || winnerTeamName) && (
          <div className="mb-8 overflow-hidden rounded-2xl bg-gradient-to-r from-brand-900/60 to-brand-800/30 ring-1 ring-brand-700/50 px-8 py-7 text-center">
            <p className="text-4xl mb-3">🏆</p>
            <p className="text-xs font-semibold uppercase tracking-widest text-brand-400 mb-1">Champion</p>
            <p className="text-2xl font-bold text-white">
              {isTeamEvent
                ? winnerTeamName
                : winnerEntry?.partner_name
                  ? `${winnerEntry.player_name} / ${winnerEntry.partner_name}`
                  : winnerEntry?.player_name}
            </p>
            <p className="mt-1 text-sm text-slate-400">{cat.name} · {tournament.name}</p>
          </div>
        )}

        {(isTeamEvent ? ties.length : matches.length) === 0 ? (
          <div className="rounded-xl bg-surface-card p-10 text-center ring-1 ring-surface-border">
            <p className="text-sm text-slate-500">Draw not yet available.</p>
          </div>
        ) : isTeamEvent ? (
          <>
            <TeamStandingsTable ties={ties} advancePerGroup={(cat as { advance_per_group?: number }).advance_per_group ?? 2} />
            <TeamBracketView ties={ties} categoryId={cat.id} isManager={isManager} />
          </>
        ) : (
          <>
            <StandingsTable
              matches={matches}
              format={cat.draw_format}
              advancePerGroup={
                cat.draw_format === 'group_stage_knockout'
                  ? ((cat as { advance_per_group?: number }).advance_per_group ?? 2)
                  : undefined
              }
            />
            <div className="mt-8">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-slate-500">
                {cat.draw_format === 'group_stage_knockout' ? 'Bracket' : 'Draw'}
              </h2>
              <BracketView matches={matches} format={cat.draw_format} tournamentSlug={tournamentSlug} readOnly={!isManager} />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
