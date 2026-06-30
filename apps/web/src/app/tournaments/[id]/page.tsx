import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { createAdminClient, getCurrentUser, getUserRoles, isSuperAdmin } from '@/lib/supabase/server';
import { AppNav } from '@/components/layout/AppNav';
import { TournamentStatusControl } from '@/components/tournaments/TournamentStatusControl';
import { AddCategoryInline } from '@/components/tournaments/AddCategoryInline';
import { RegistrationQR } from '@/components/ui/RegistrationQR';
import { CloneTournamentButton } from '@/components/tournaments/CloneTournamentButton';
import type { TournamentStatus } from '@/lib/actions/tournaments';
import { DRAW_FORMATS, PLAY_FORMATS } from '@pickleball/shared';

export const metadata: Metadata = { title: 'Tournament' };

interface Props {
  params: Promise<{ id: string }>;
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-slate-700 text-slate-300' },
  registration_open: { label: 'Registration open', className: 'bg-blue-900/60 text-blue-300' },
  in_progress: { label: 'In progress', className: 'bg-accent-500/20 text-accent-400' },
  completed: { label: 'Completed', className: 'bg-brand-600/20 text-brand-300' },
  cancelled: { label: 'Cancelled', className: 'bg-red-900/40 text-red-400' },
};

const FORMAT_LABEL: Record<string, string> = Object.fromEntries(
  DRAW_FORMATS.map((f) => [f.value, f.label]),
);

const CATEGORY_STATUS: Record<string, { label: string; className: string }> = {
  pending:        { label: 'Setup',         className: 'bg-slate-700/50 text-slate-400' },
  registration:   { label: 'Registration',  className: 'bg-blue-900/40 text-blue-400' },
  draw_generated: { label: 'Draw ready',    className: 'bg-brand-900/40 text-brand-300' },
  in_progress:    { label: 'In progress',   className: 'bg-accent-500/20 text-accent-400' },
  completed:      { label: 'Completed',     className: 'bg-slate-700/40 text-slate-400' },
};

const PLAY_FORMAT_LABEL: Record<string, string> = Object.fromEntries(
  PLAY_FORMATS.map((f) => [f.value, f.label]),
);

export default async function TournamentPage({ params }: Props) {
  const { id: slug } = await params;

  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();

  // Look up by slug
  const { data: t } = await admin
    .from('tournaments')
    .select('*, clubs!inner(id, name, slug, brand_primary_color), tournament_categories(*, slug)')
    .eq('slug', slug)
    .single();

  if (!t) notFound();

  const club = t.clubs as { id: string; name: string; slug: string; brand_primary_color: string };

  // Verify user manages this club
  const { data: mgr } = await admin
    .from('club_managers')
    .select('role')
    .eq('club_id', club.id)
    .eq('player_id', user.id)
    .maybeSingle();

  if (!mgr) notFound();

  // ── Mode guard ────────────────────────────────────────────────────────────
  // This page is admin-only. If a dual-role user is currently in player mode,
  // send them to the public event page instead of showing admin controls.
  const roles = getUserRoles(user);
  const isAdminRole  = roles.includes('admin');
  const isPlayerRole = roles.includes('player') || roles.length === 0;
  const hasBothRoles = isAdminRole && isPlayerRole;

  const rawMode = (await cookies()).get('active_mode')?.value;
  const activeMode: 'admin' | 'player' = hasBothRoles
    ? (rawMode === 'player' ? 'player' : 'admin')
    : isAdminRole ? 'admin'
    : 'player';

  // Once a tournament is completed, only super admins can edit it or add categories
  const canEditCompleted = isSuperAdmin(user);

  if (activeMode === 'player') {
    // Redirect to the public-facing event page (shows registration, draw, etc.)
    redirect(`/events/${slug}`);
  }

  // Entry counts, pending approvals, and match stages — all independent, run in parallel.
  const [
    { data: entryCounts },
    { data: teamCounts },
    { count: pendingCount },
    { count: pendingScoreCount },
    { data: stageMatches },
  ] = await Promise.all([
    // Entry count per category (active only) — singles/doubles
    admin
      .from('tournament_entries')
      .select('category_id')
      .eq('tournament_id', t.id)
      .eq('status', 'active'),
    // Team count per category (active only) — team_event categories don't
    // create tournament_entries rows until a rubber's lineup is submitted,
    // so they're counted from tournament_teams instead.
    admin
      .from('tournament_teams')
      .select('category_id')
      .eq('tournament_id', t.id)
      .eq('status', 'active'),
    // Pending entry count (for approval badge)
    admin
      .from('tournament_entries')
      .select('id', { count: 'exact', head: true })
      .eq('tournament_id', t.id)
      .eq('status', 'pending'),
    // Pending score approvals (player self-reports awaiting organiser review)
    admin
      .from('matches')
      .select('id', { count: 'exact', head: true })
      .eq('tournament_id', t.id)
      .not('player_reported_winner_id', 'is', null)
      .neq('status', 'completed')
      .neq('status', 'walkover'),
    // Current stage per category — e.g. "Group stage", "Round of 16", "Final"
    admin
      .from('matches')
      .select('category_id, round, round_name, group_name, status, entry_a_id, entry_b_id')
      .eq('tournament_id', t.id),
  ]);

  const countByCategory: Record<string, number> = {};
  for (const e of entryCounts ?? []) {
    countByCategory[e.category_id] = (countByCategory[e.category_id] ?? 0) + 1;
  }
  const teamCountByCategory: Record<string, number> = {};
  for (const team of teamCounts ?? []) {
    teamCountByCategory[team.category_id] = (teamCountByCategory[team.category_id] ?? 0) + 1;
  }

  const stageByCategory: Record<string, string> = {};
  const matchesByCategory = new Map<string, typeof stageMatches extends (infer R)[] | null ? R[] : never>();
  for (const m of stageMatches ?? []) {
    const list = matchesByCategory.get(m.category_id) ?? [];
    list.push(m);
    matchesByCategory.set(m.category_id, list);
  }
  for (const [catId, ms] of matchesByCategory) {
    const groupMatches = ms.filter((m) => m.group_name !== null);
    const knockoutMatches = ms.filter((m) => m.group_name === null);
    const isDone = (m: { status: string }) => m.status === 'completed' || m.status === 'walkover';

    if (groupMatches.length > 0 && !groupMatches.every(isDone)) {
      stageByCategory[catId] = 'Group stage';
      continue;
    }

    if (knockoutMatches.length > 0) {
      if (knockoutMatches.every(isDone)) {
        continue; // fully complete — base status badge already says "Completed"
      }
      const playable = knockoutMatches
        .filter((m) => m.entry_a_id && m.entry_b_id && !isDone(m))
        .sort((a, b) => a.round - b.round);
      if (playable.length > 0) {
        stageByCategory[catId] = playable[0].round_name ?? `Round ${playable[0].round}`;
      } else if (groupMatches.length > 0) {
        stageByCategory[catId] = 'Group stage complete';
      }
      continue;
    }

    // No group/knockout split (e.g. round robin, swiss, single/double elim)
    const playable = ms
      .filter((m) => m.entry_a_id && m.entry_b_id && !isDone(m))
      .sort((a, b) => a.round - b.round);
    if (playable.length > 0 && ms.some((m) => isDone(m))) {
      stageByCategory[catId] = playable[0].round_name ?? `Round ${playable[0].round}`;
    }
  }

  type Category = {
    id: string;
    name: string;
    slug: string;
    play_format: string;
    draw_format: string;
    status: string;
    max_entries: number | null;
  };
  const categories = (t.tournament_categories as unknown as Category[]) ?? [];
  const badge = STATUS_BADGE[t.status] ?? STATUS_BADGE.draft;

  const dateRange = (() => {
    const fmt = (d: string) =>
      new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
    return t.start_date === t.end_date
      ? fmt(t.start_date)
      : `${fmt(t.start_date)} – ${fmt(t.end_date)}`;
  })();

  return (
    <div className="min-h-screen bg-surface">
      <AppNav />

      <main className="mx-auto max-w-6xl px-6 py-10">
        {/* Breadcrumb */}
        <nav className="mb-6 flex items-center gap-2 text-xs text-slate-500 sm:text-sm">
          <Link href={`/clubs/${club.slug}`} className="hover:text-slate-300 transition-colors">
            {club.name}
          </Link>
          <span>/</span>
          <span className="text-slate-400">{t.name}</span>
        </nav>

        {/* Header */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold text-white">{t.name}</h1>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}>
                {badge.label}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-400">
              {dateRange}
              {t.venue && ` · ${t.venue}`}
              {` · ${t.court_count} court${t.court_count !== 1 ? 's' : ''}`}
            </p>
          </div>

          {/* Actions — stacked on mobile, inline row on desktop */}
          <div className="flex flex-col gap-2 shrink-0 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
            {(t.status !== 'completed' || canEditCompleted) && (
              <Link
                href={`/tournaments/${slug}/edit`}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-surface-card hover:border-slate-500 transition-colors sm:justify-start"
              >
                <span>✏️</span> Edit
              </Link>
            )}
            <TournamentStatusControl
              tournamentId={t.id}
              currentStatus={t.status as TournamentStatus}
            />
          </div>
        </div>

        {/* Stat cards */}
        <div className="mb-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: 'Categories', value: categories.length },
            { label: 'Entries', value: Object.values(countByCategory).reduce((a, b) => a + b, 0) },
            { label: 'Courts', value: t.court_count },
            { label: 'Display code', value: t.display_code },
          ].map((s) => (
            <div key={s.label} className="rounded-xl bg-surface-card p-5 ring-1 ring-surface-border">
              <p className="text-2xl font-bold text-white">{s.value}</p>
              <p className="mt-1 text-xs text-slate-500">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Registration QR */}
        {t.status === 'registration_open' && (
          <div className="mb-8">
            <RegistrationQR
              url={`${process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'}/events/${slug}`}
              label={`Register for ${t.name}`}
            />
          </div>
        )}

        {/* Quick links */}
        <div className="mb-10 grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
          <Link
            href={`/tournaments/${slug}/registrations`}
            className="relative flex flex-col items-center justify-center gap-1 rounded-lg border border-surface-border px-3 py-3 text-sm text-slate-300 hover:bg-surface-card transition-colors min-h-[64px] text-center sm:flex-row sm:justify-start sm:gap-2 sm:min-h-0 sm:text-left sm:px-4 sm:py-2"
          >
            <span>📋</span> Registrations
            {(pendingCount ?? 0) > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white">
                {pendingCount}
              </span>
            )}
          </Link>
          <Link
            href={`/tournaments/${slug}/schedule`}
            className="flex flex-col items-center justify-center gap-1 rounded-lg border border-surface-border px-3 py-3 text-sm text-slate-300 hover:bg-surface-card transition-colors min-h-[64px] text-center sm:flex-row sm:justify-start sm:gap-2 sm:min-h-0 sm:text-left sm:px-4 sm:py-2"
          >
            <span>📅</span> Schedule
          </Link>
          <Link
            href={`/tournaments/${slug}/scoring`}
            className="relative flex flex-col items-center justify-center gap-1 rounded-lg border border-surface-border px-3 py-3 text-sm text-slate-300 hover:bg-surface-card transition-colors min-h-[64px] text-center sm:flex-row sm:justify-start sm:gap-2 sm:min-h-0 sm:text-left sm:px-4 sm:py-2"
          >
            <span>🎾</span> Scoring
            {(pendingScoreCount ?? 0) > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white">
                {pendingScoreCount}
              </span>
            )}
          </Link>
          <Link
            href={`/display/${t.display_code}`}
            target="_blank"
            className="flex flex-col items-center justify-center gap-1 rounded-lg border border-surface-border px-3 py-3 text-sm text-slate-300 hover:bg-surface-card transition-colors min-h-[64px] text-center sm:flex-row sm:justify-start sm:gap-2 sm:min-h-0 sm:text-left sm:px-4 sm:py-2"
          >
            <span>📺</span> Display screen
          </Link>
          <Link
            href={`/tournaments/${slug}/display-control`}
            className="flex flex-col items-center justify-center gap-1 rounded-lg border border-surface-border px-3 py-3 text-sm text-slate-300 hover:bg-surface-card transition-colors min-h-[64px] text-center sm:flex-row sm:justify-start sm:gap-2 sm:min-h-0 sm:text-left sm:px-4 sm:py-2"
          >
            <span>🎛️</span> Display control
          </Link>
          <Link
            href={`/tournaments/${slug}/analytics`}
            className="flex flex-col items-center justify-center gap-1 rounded-lg border border-surface-border px-3 py-3 text-sm text-slate-300 hover:bg-surface-card transition-colors min-h-[64px] text-center sm:flex-row sm:justify-start sm:gap-2 sm:min-h-0 sm:text-left sm:px-4 sm:py-2"
          >
            <span>📈</span> Analytics
          </Link>
          <Link
            href={`/events/${slug}`}
            target="_blank"
            className="flex flex-col items-center justify-center gap-1 rounded-lg border border-surface-border px-3 py-3 text-sm text-slate-300 hover:bg-surface-card transition-colors min-h-[64px] text-center sm:flex-row sm:justify-start sm:gap-2 sm:min-h-0 sm:text-left sm:px-4 sm:py-2"
          >
            <span>🌐</span> Public page
          </Link>
          <Link
            href={`/tournaments/${slug}/results`}
            className="flex flex-col items-center justify-center gap-1 rounded-lg border border-surface-border px-3 py-3 text-sm text-slate-300 hover:bg-surface-card transition-colors min-h-[64px] text-center sm:flex-row sm:justify-start sm:gap-2 sm:min-h-0 sm:text-left sm:px-4 sm:py-2"
          >
            <span>🏆</span> Results
          </Link>
          <Link
            href={`/tournaments/${slug}/announcements`}
            className="flex flex-col items-center justify-center gap-1 rounded-lg border border-surface-border px-3 py-3 text-sm text-slate-300 hover:bg-surface-card transition-colors min-h-[64px] text-center sm:flex-row sm:justify-start sm:gap-2 sm:min-h-0 sm:text-left sm:px-4 sm:py-2"
          >
            <span>📢</span> Announcements
          </Link>
          <CloneTournamentButton tournamentId={t.id} />
        </div>

        {/* Categories */}
        <div>
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-white">Categories</h2>
            {(t.status !== 'completed' || canEditCompleted) && (
            <AddCategoryInline
              tournamentId={t.id}
              tournamentScoringFormat={((t as { scoring_format?: string }).scoring_format ?? 'rally') as 'rally' | 'traditional'}
              tournamentNumSets={((t as { num_sets?: number }).num_sets ?? 1) as 1 | 3 | 5}
              tournamentPointsPerSet={(t as { points_per_set?: number }).points_per_set ?? 11}
              tournamentWinBy={((t as { win_by?: number }).win_by ?? 2) as 1 | 2}
              tournamentDeuceCap={(t as { deuce_cap?: number | null }).deuce_cap ?? null}
            />
            )}
          </div>

          {categories.length === 0 ? (
            <div className="mt-4 rounded-xl bg-surface-card p-8 text-center ring-1 ring-surface-border">
              <p className="text-sm text-slate-500">
                No categories yet. Add a category to define how players will compete.
              </p>
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              {categories.map((cat) => {
                const entryCount = cat.play_format === 'team_event'
                  ? (teamCountByCategory[cat.id] ?? 0)
                  : (countByCategory[cat.id] ?? 0);
                const catStatus = CATEGORY_STATUS[cat.status] ?? CATEGORY_STATUS.pending;
                const stageLabel = stageByCategory[cat.id];
                return (
                  <Link
                    key={cat.id}
                    href={`/tournaments/${slug}/categories/${cat.slug}`}
                    className="flex items-center justify-between rounded-xl bg-surface-card px-5 py-4 ring-1 ring-surface-border hover:ring-brand-500/40 transition-all"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2.5">
                        <p className="text-sm font-semibold text-white truncate">{cat.name}</p>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${catStatus.className}`}>
                          {catStatus.label}
                        </span>
                        {stageLabel && (
                          <span className="shrink-0 rounded-full bg-surface-border/50 px-2 py-0.5 text-[10px] font-semibold text-slate-300">
                            {stageLabel}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {PLAY_FORMAT_LABEL[cat.play_format] ?? cat.play_format} ·{' '}
                        {FORMAT_LABEL[cat.draw_format] ?? cat.draw_format}
                      </p>
                    </div>
                    <div className="flex items-center gap-4 shrink-0 ml-4">
                      <div className="text-right">
                        <p className="text-sm font-bold text-white">{entryCount}</p>
                        <p className="text-xs text-slate-500">
                          {cat.max_entries ? `/ ${cat.max_entries}` : 'entries'}
                        </p>
                      </div>
                      <span className="text-slate-500">›</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
