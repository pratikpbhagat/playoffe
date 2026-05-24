import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/server';
import { AppNav } from '@/components/layout/AppNav';
import { BracketView } from '@/components/tournaments/BracketView';
import { StandingsTable } from '@/components/tournaments/StandingsTable';
import { getMatchesForCategory } from '@/lib/actions/draws';
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

  // Look up tournament by slug
  const { data: tournament } = await admin
    .from('tournaments')
    .select('id, name, slug')
    .eq('slug', tournamentSlug)
    .single();

  if (!tournament) notFound();

  // Look up category by slug + tournament_id
  const { data: cat } = await admin
    .from('tournament_categories')
    .select('id, name, draw_format, status, tournament_id')
    .eq('slug', catSlug)
    .eq('tournament_id', tournament.id)
    .single();

  if (!cat) notFound();

  // Only show if draw is generated or later
  if (!['draw_generated', 'in_progress', 'completed'].includes(cat.status)) notFound();

  const matches = await getMatchesForCategory(cat.id);

  // Find the winner: the last match with a winner (final/grand final)
  const completedMatches = matches.filter((m) => m.status === 'completed' || m.status === 'walkover');
  const finalMatch = completedMatches.length > 0
    ? completedMatches.reduce((a, b) => (b.round > a.round ? b : a), completedMatches[0])
    : null;
  const winnerEntry = finalMatch?.winner_entry_id
    ? (finalMatch.winner_entry_id === finalMatch.entry_a?.id ? finalMatch.entry_a : finalMatch.entry_b)
    : null;
  const isCompleted = cat.status === 'completed';

  return (
    <div className="min-h-screen bg-surface">
      <AppNav />

      <main className="mx-auto max-w-6xl px-6 py-10">
        {/* Breadcrumb */}
        <nav className="mb-6 flex items-center gap-2 text-sm text-slate-500">
          <Link href="/events" className="hover:text-slate-300 transition-colors">Tournaments</Link>
          <span>/</span>
          <Link href={`/events/${tournamentSlug}`} className="hover:text-slate-300 transition-colors">
            {tournament.name}
          </Link>
          <span>/</span>
          <span className="text-slate-400">{cat.name} Draw</span>
        </nav>

        <h1 className="mb-2 text-xl font-bold text-white">{cat.name}</h1>
        <p className="mb-8 text-sm text-slate-500">{tournament.name}</p>

        {/* Winner banner — shown when category is completed */}
        {isCompleted && winnerEntry && (
          <div className="mb-8 overflow-hidden rounded-2xl bg-gradient-to-r from-brand-900/60 to-brand-800/30 ring-1 ring-brand-700/50 px-8 py-7 text-center">
            <p className="text-4xl mb-3">🏆</p>
            <p className="text-xs font-semibold uppercase tracking-widest text-brand-400 mb-1">Champion</p>
            <p className="text-2xl font-bold text-white">
              {winnerEntry.partner_name
                ? `${winnerEntry.player_name} / ${winnerEntry.partner_name}`
                : winnerEntry.player_name}
            </p>
            <p className="mt-1 text-sm text-slate-400">{cat.name} · {tournament.name}</p>
          </div>
        )}

        {matches.length === 0 ? (
          <div className="rounded-xl bg-surface-card p-10 text-center ring-1 ring-surface-border">
            <p className="text-sm text-slate-500">Draw not yet available.</p>
          </div>
        ) : (
          <>
            <StandingsTable matches={matches} format={cat.draw_format} />
            <div className="mt-8">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-slate-500">
                {cat.draw_format === 'group_stage_knockout' ? 'Bracket' : 'Draw'}
              </h2>
              <BracketView matches={matches} format={cat.draw_format} tournamentSlug={tournamentSlug} />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
