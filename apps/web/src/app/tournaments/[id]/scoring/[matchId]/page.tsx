import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { createClient, createAdminClient, getUserRoles } from '@/lib/supabase/server';
import { AppNav } from '@/components/layout/AppNav';
import { MatchScoreCard } from '@/components/scoring/MatchScoreCard';
import { MatchAssignmentBadges } from '@/components/scoring/MatchAssignmentBadges';
import { OverrideResultPanel } from '@/components/scoring/OverrideResultPanel';
import { CopyLinkButton } from '@/components/ui/CopyLinkButton';

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

  // Fetch tournament-level scoring defaults (new columns — bypass generated types)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: tScoring } = await (admin as any)
    .from('tournaments')
    .select('scoring_format, points_per_set, win_by')
    .eq('slug', slug)
    .single() as { data: { scoring_format: string | null; points_per_set: number | null; win_by: number | null } | null };

  const { data: mgr } = await admin
    .from('club_managers')
    .select('role')
    .eq('club_id', t.club_id)
    .eq('player_id', user.id)
    .maybeSingle();
  if (!mgr) notFound();

  // Mode guard
  const roles = getUserRoles(user);
  const isAdminRole = roles.includes('admin');
  const isPlayerRole = roles.includes('player') || roles.length === 0;
  const hasBothRoles = isAdminRole && isPlayerRole;
  const rawMode = (await cookies()).get('active_mode')?.value;
  const activeMode: 'admin' | 'player' = hasBothRoles
    ? (rawMode === 'player' ? 'player' : 'admin')
    : isAdminRole ? 'admin' : 'player';
  if (activeMode === 'player') redirect(`/events/${slug}`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: match } = await (admin as any)
    .from('matches')
    .select(`
      id, round, round_name, group_name, status, court, sets,
      assigned_referee_name, paused_for_reassignment,
      started_at, completed_at, winner_entry_id, serving_entry_id, server_number,
      player_reported_winner_id, player_reported_sets,
      ea:tournament_entries!entry_a_id(
        id, seed,
        players!player_id(id, full_name, username, global_stats(current_rating)),
        partner:players!partner_id(id, full_name, username)
      ),
      eb:tournament_entries!entry_b_id(
        id, seed,
        players!player_id(id, full_name, username, global_stats(current_rating)),
        partner:players!partner_id(id, full_name, username)
      ),
      tc:tournament_categories!category_id(id, name, play_format, scoring_override, scoring_format, points_per_set, win_by)
    `)
    .eq('id', matchId)
    .single() as { data: Record<string, any> | null };

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
    partner: { id: string; full_name: string; username: string } | null;
  };

  const ea = match.ea as unknown as EntryDetail | null;
  const eb = match.eb as unknown as EntryDetail | null;
  const tc = match.tc as unknown as {
    id: string; name: string; play_format: string;
    scoring_override: boolean; scoring_format: string | null;
    points_per_set: number | null; win_by: number | null;
  } | null;
  const isDoubles = tc?.play_format === 'doubles' || tc?.play_format === 'mixed_doubles';

  // Resolve effective scoring config: category overrides tournament defaults
  const effectivePointsPerSet = (tc?.scoring_override ? tc?.points_per_set : null) ?? tScoring?.points_per_set ?? 11;
  const effectiveWinBy = (tc?.scoring_override ? tc?.win_by : null) ?? tScoring?.win_by ?? 2;
  const effectiveScoringFormat = ((tc?.scoring_override ? tc?.scoring_format : null) ?? tScoring?.scoring_format ?? 'traditional') as 'rally' | 'traditional';

  // Build team display names (e.g. "Alice / Bob" for doubles)
  function teamName(entry: EntryDetail | null): string {
    if (!entry?.players) return 'TBD';
    const main = entry.players.full_name;
    if (isDoubles && entry.partner) return `${main} / ${entry.partner.full_name}`;
    return main;
  }

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
        </nav>

        <div className="mb-6">
          {/* Category · Round · Group — bold single line, no player names (shown in the score card below) */}
          <h1 className="text-xl font-bold text-white truncate">
            {[tc?.name, match.round_name, match.group_name].filter(Boolean).join(' · ')}
          </h1>
          {/* Court / referee assignment info — updates live via Realtime */}
          <MatchAssignmentBadges
            matchId={matchId}
            initialCourt={match.court}
            initialRefereeName={(match as any).assigned_referee_name ?? null}
          />
        </div>

        {/* Player self-report link — only for unscored matches */}
        {(match.status === 'scheduled' || match.status === 'in_progress') && (
          <div className="mb-5 rounded-xl bg-surface-card ring-1 ring-surface-border px-5 py-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Player self-report link
            </p>
            <p className="text-xs text-slate-600 mb-3">
              Share this link with players so they can submit the score from their phone after the match.
            </p>
            <CopyLinkButton
              url={`${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/events/${slug}/score-report/${matchId}`}
            />
          </div>
        )}

        <MatchScoreCard
          matchId={matchId}
          tournamentSlug={slug}
          categoryId={tc?.id ?? ''}
          status={match.status}
          court={match.court}
          maxCourts={t.court_count}
          initialSets={(match.sets as { set_number: number; score_a: number; score_b: number }[]) ?? []}
          winnerEntryId={match.winner_entry_id}
          initialServingEntryId={(match as any).serving_entry_id ?? null}
          initialServerNumber={(match as any).server_number ?? null}
          pointsPerSet={effectivePointsPerSet}
          winBy={effectiveWinBy}
          scoringFormat={effectiveScoringFormat}
          entryA={ea ? {
            id: ea.id,
            seed: ea.seed,
            player_name: teamName(ea),
            player_username: ea.players?.username ?? '',
            rating: ea.players?.global_stats?.current_rating ?? 3.5,
          } : null}
          entryB={eb ? {
            id: eb.id,
            seed: eb.seed,
            player_name: teamName(eb),
            player_username: eb.players?.username ?? '',
            rating: eb.players?.global_stats?.current_rating ?? 3.5,
          } : null}
          playerReportedWinnerId={match.player_reported_winner_id ?? null}
          playerReportedSets={
            (match.player_reported_sets as { set_number: number; score_a: number; score_b: number }[] | null) ?? null
          }
          pausedForReassignment={(match as any).paused_for_reassignment ?? false}
        />

        {/* Override panel — only for completed matches */}
        {match.status === 'completed' && ea && eb && (
          <OverrideResultPanel
            matchId={matchId}
            entryAId={ea.id}
            entryAName={teamName(ea)}
            entryBId={eb.id}
            entryBName={teamName(eb)}
            currentWinnerId={match.winner_entry_id ?? null}
            currentSets={(match.sets as { set_number: number; score_a: number; score_b: number }[]) ?? []}
          />
        )}
      </main>
    </div>
  );
}
