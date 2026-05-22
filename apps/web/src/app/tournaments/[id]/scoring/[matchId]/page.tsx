import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { AppNav } from '@/components/layout/AppNav';
import { MatchScoreCard } from '@/components/scoring/MatchScoreCard';

export const metadata: Metadata = { title: 'Score match' };

interface Props {
  params: Promise<{ id: string; matchId: string }>;
}

export default async function MatchScoringPage({ params }: Props) {
  const { id: slug, matchId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();

  const { data: t } = await admin
    .from('tournaments')
    .select('id, name, club_id, court_count')
    .eq('slug', slug)
    .single();
  if (!t) notFound();

  const { data: mgr } = await admin
    .from('club_managers')
    .select('role')
    .eq('club_id', t.club_id)
    .eq('player_id', user.id)
    .maybeSingle();
  if (!mgr) notFound();

  const { data: match } = await admin
    .from('matches')
    .select(`
      id, round, round_name, group_name, status, court, sets,
      started_at, completed_at, winner_entry_id,
      ea:tournament_entries!entry_a_id(
        id, seed,
        players!player_id(id, full_name, username, global_stats(current_rating))
      ),
      eb:tournament_entries!entry_b_id(
        id, seed,
        players!player_id(id, full_name, username, global_stats(current_rating))
      ),
      tc:tournament_categories!category_id(id, name, play_format)
    `)
    .eq('id', matchId)
    .single();

  if (!match) notFound();

  type EntryDetail = {
    id: string;
    seed: number | null;
    players: {
      id: string;
      full_name: string;
      username: string;
      global_stats: { current_rating: number } | null;
    } | null;
  };

  const ea = match.ea as unknown as EntryDetail | null;
  const eb = match.eb as unknown as EntryDetail | null;
  const tc = match.tc as unknown as { id: string; name: string; play_format: string } | null;

  return (
    <div className="min-h-screen bg-surface">
      <AppNav />

      <main className="mx-auto max-w-2xl px-6 py-10">
        <nav className="mb-6 flex items-center gap-2 text-sm text-slate-500 flex-wrap">
          <Link href={`/tournaments/${slug}`} className="hover:text-slate-300 transition-colors">
            {t.name}
          </Link>
          <span>/</span>
          <Link href={`/tournaments/${slug}/scoring`} className="hover:text-slate-300 transition-colors">
            Scoring
          </Link>
          <span>/</span>
          <span className="text-slate-400">
            {ea?.players?.full_name ?? 'TBD'} vs {eb?.players?.full_name ?? 'TBD'}
          </span>
        </nav>

        <div className="mb-6">
          <p className="text-xs text-slate-500 mb-1">
            {tc?.name ?? ''}
            {match.round_name ? ` · ${match.round_name}` : ''}
            {match.group_name ? ` · ${match.group_name}` : ''}
          </p>
          <h1 className="text-xl font-bold text-white">
            {ea?.players?.full_name ?? 'TBD'}
            <span className="mx-3 text-slate-600 font-normal">vs</span>
            {eb?.players?.full_name ?? 'TBD'}
          </h1>
        </div>

        <MatchScoreCard
          matchId={matchId}
          tournamentSlug={slug}
          categoryId={tc?.id ?? ''}
          status={match.status}
          court={match.court}
          maxCourts={t.court_count}
          initialSets={(match.sets as { set_number: number; score_a: number; score_b: number }[]) ?? []}
          winnerEntryId={match.winner_entry_id}
          entryA={ea ? {
            id: ea.id,
            seed: ea.seed,
            player_name: ea.players?.full_name ?? 'Unknown',
            player_username: ea.players?.username ?? '',
            rating: ea.players?.global_stats?.current_rating ?? 3.5,
          } : null}
          entryB={eb ? {
            id: eb.id,
            seed: eb.seed,
            player_name: eb.players?.full_name ?? 'Unknown',
            player_username: eb.players?.username ?? '',
            rating: eb.players?.global_stats?.current_rating ?? 3.5,
          } : null}
        />
      </main>
    </div>
  );
}
