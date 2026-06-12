import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { createClient, createAdminClient, getUserRoles } from '@/lib/supabase/server';
import { AppNav } from '@/components/layout/AppNav';
import { EntryList } from '@/components/tournaments/EntryList';
import { AddPlayerByEmail } from '@/components/tournaments/AddPlayerByEmail';
import { ImportPlayersPanel } from '@/components/tournaments/ImportPlayersPanel';
import { DrawSection } from '@/components/tournaments/DrawSection';
import { StandingsTable } from '@/components/tournaments/StandingsTable';
import { CategoryEditInline } from '@/components/tournaments/CategoryEditInline';
import { StageScoringPanel } from '@/components/tournaments/StageScoringPanel';
import { SeedingPanel } from '@/components/tournaments/SeedingPanel';
import { getCategoryWithEntries, getStageScoringAction } from '@/lib/actions/categories';
import { getTournamentStageScoringAction } from '@/lib/actions/tournaments';
import { getMatchesForCategory } from '@/lib/actions/draws';
import { isFeatureEnabled } from '@/lib/features';

export const metadata: Metadata = { title: 'Category entries' };

interface Props {
  params: Promise<{ id: string; catId: string }>;
}

const PLAY_FORMAT_LABEL: Record<string, string> = {
  singles: 'Singles',
  doubles: 'Doubles',
  mixed_doubles: 'Mixed doubles',
};

const FORMAT_LABEL: Record<string, string> = {
  round_robin: 'Round robin',
  single_elimination: 'Single elimination',
  double_elimination: 'Double elimination',
  group_stage_knockout: 'Group stage + knockout',
  swiss: 'Swiss',
};

export default async function CategoryPage({ params }: Props) {
  const { id: tournamentSlug, catId: catSlug } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();

  // Look up tournament by slug
  const { data: tournament } = await admin
    .from('tournaments')
    .select('id, name, club_id')
    .eq('slug', tournamentSlug)
    .single();

  // Fetch tournament scoring defaults (new columns — bypass generated types with cast)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: tScoring } = await (admin as any)
    .from('tournaments')
    .select('scoring_format, num_sets, points_per_set')
    .eq('slug', tournamentSlug)
    .maybeSingle();
  const tournamentScoring = (tScoring ?? {}) as {
    scoring_format?: string;
    num_sets?: number;
    points_per_set?: number;
  };

  if (!tournament) notFound();

  // Verify manager access
  const { data: mgr } = await admin
    .from('club_managers')
    .select('role')
    .eq('club_id', tournament.club_id)
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
  if (activeMode === 'player') redirect(`/events/${tournamentSlug}`);

  // Look up category by slug + tournament_id
  const { data: categoryRow } = await admin
    .from('tournament_categories')
    .select('id')
    .eq('slug', catSlug)
    .eq('tournament_id', tournament.id)
    .single();

  if (!categoryRow) notFound();

  const categoryId = categoryRow.id;

  // Fetch category + entries + matches + stage scoring + social flag in parallel
  const [data, matches, stageRows, tournamentStageRows, organiserSocialEnabled] = await Promise.all([
    getCategoryWithEntries(categoryId),
    getMatchesForCategory(categoryId),
    getStageScoringAction(categoryId),
    getTournamentStageScoringAction(tournament.id),
    isFeatureEnabled('social_media_organiser'),
  ]);
  if (!data) notFound();

  const { category, entries } = data;

  const tournamentInfo = category.tournaments as {
    id: string;
    name: string;
    clubs: { name: string; brand_primary_color: string };
  };

  const clubName = (tournamentInfo.clubs as { name: string })?.name ?? 'Club';
  const clubColor = (tournamentInfo.clubs as { brand_primary_color: string })?.brand_primary_color ?? '#7c3aed';

  type EntryRow = {
    id: string;
    seed: number | null;
    registered_at: string;
    players: {
      id: string;
      full_name: string;
      username: string;
      photo_url: string | null;
      global_stats: { current_rating: number } | null;
    } | null;
    partner: {
      id: string;
      full_name: string;
      username: string;
    } | null;
  };
  const typedEntries = entries as unknown as EntryRow[];

  const entryCount = typedEntries.length;
  const maxEntries = (category as { max_entries: number | null }).max_entries;
  const categoryStatus = (category as { status: string }).status;
  const drawFormat = (category as { draw_format: string }).draw_format;

  const isDrawn =
    categoryStatus === 'draw_generated' ||
    categoryStatus === 'in_progress' ||
    categoryStatus === 'completed';

  // ── Organiser "share draw on social" button visibility ────────────────────
  // Show only when the organiser flag is enabled AND the club has at least one
  // active social connection (otherwise clicking the button is pointless).
  let canShareOnSocial = false;
  if (organiserSocialEnabled && isDrawn) {
    const { data: clubConns } = await admin
      .from('club_social_connections' as any)
      .select('id')
      .eq('club_id', tournament.club_id)
      .eq('is_active', true)
      .limit(1);
    canShareOnSocial = (clubConns as any[] | null)?.length ? (clubConns as any[]).length > 0 : false;
  }

  // ── Draw staleness detection ───────────────────────────────────────────────
  // Compare entries referenced in matches vs current active entries.
  // No extra DB queries — both datasets are already fetched above.
  type StalenessEntry = { id: string; name: string };
  let withdrawnInDraw: StalenessEntry[] = [];
  let unplacedActive: StalenessEntry[] = [];

  if (isDrawn && matches.length > 0) {
    // Collect every entry ID that appears in at least one match slot
    const drawEntryIds = new Set<string>();
    for (const m of matches) {
      if (m.entry_a) drawEntryIds.add(m.entry_a.id);
      if (m.entry_b) drawEntryIds.add(m.entry_b.id);
    }

    // Withdrawn entries that are still referenced in the bracket
    const seenWithdrawn = new Set<string>();
    for (const m of matches) {
      if (m.entry_a?.entry_status === 'withdrawn' && !seenWithdrawn.has(m.entry_a.id)) {
        seenWithdrawn.add(m.entry_a.id);
        withdrawnInDraw.push({ id: m.entry_a.id, name: m.entry_a.player_name });
      }
      if (m.entry_b?.entry_status === 'withdrawn' && !seenWithdrawn.has(m.entry_b.id)) {
        seenWithdrawn.add(m.entry_b.id);
        withdrawnInDraw.push({ id: m.entry_b.id, name: m.entry_b.player_name });
      }
    }

    // Active entries that have no match slot yet (added after draw was generated)
    unplacedActive = typedEntries
      .filter((e) => !drawEntryIds.has(e.id))
      .map((e) => ({ id: e.id, name: e.players?.full_name ?? 'Unknown' }));
  }

  // For formats where groups or standings are meaningful, show StandingsTable
  // instead of a flat entry list once the draw is generated.
  const STANDINGS_FORMATS = ['round_robin', 'swiss', 'group_stage_knockout'];
  const showGroupStandings = isDrawn && STANDINGS_FORMATS.includes(drawFormat);

  return (
    <div className="min-h-screen bg-surface">
      <AppNav />

      <main className="mx-auto max-w-4xl px-6 py-10">
        {/* Breadcrumb */}
        <nav className="mb-6 flex items-center gap-2 text-xs text-slate-500 sm:text-sm flex-wrap">
          <Link
            href={`/tournaments/${tournamentSlug}`}
            className="hover:text-slate-300 transition-colors"
          >
            {tournamentInfo.name}
          </Link>
          <span>/</span>
          <span className="text-slate-400">{category.name}</span>
        </nav>

        {/* Header */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex-1">
            <div className="mb-2 flex items-center gap-2">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: clubColor }}
              />
              <span className="text-xs text-slate-500">{clubName}</span>
            </div>

            <h1 className="text-2xl font-bold text-white">{category.name}</h1>
            <p className="mt-1 text-sm text-slate-400">
              {PLAY_FORMAT_LABEL[(category as { play_format: string }).play_format] ?? (category as { play_format: string }).play_format}
              {' · '}
              {FORMAT_LABEL[(category as { draw_format: string }).draw_format] ?? (category as { draw_format: string }).draw_format}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Entries count — same tile shape as Scoring + Edit */}
            <div className="flex flex-col items-center justify-center rounded-xl bg-surface-card px-4 py-3 ring-1 ring-surface-border text-center min-w-[60px]">
              <p className="text-lg font-bold text-white leading-none">{entryCount}</p>
              <p className="mt-1 text-[11px] text-slate-400">
                {maxEntries ? `/ ${maxEntries}` : 'entries'}
              </p>
            </div>

            {/* Scoring hub link — pre-selects this category on the scoring page */}
            {isDrawn && (
              <Link
                href={`/tournaments/${tournamentSlug}/scoring?category=${categoryId}`}
                className="flex flex-col items-center justify-center rounded-xl bg-surface-card px-4 py-3 ring-1 ring-surface-border hover:ring-brand-500/40 transition-all text-center min-w-[60px]"
              >
                <span className="text-lg leading-none">🎾</span>
                <span className="mt-1 text-[11px] text-slate-400">Scoring</span>
              </Link>
            )}

            <CategoryEditInline
              categoryId={categoryId}
              currentName={category.name}
              currentMaxEntries={maxEntries}
              currentPlayFormat={(category as { play_format: string }).play_format}
              currentDrawFormat={(category as { draw_format: string }).draw_format}
              canEditFormats={categoryStatus === 'pending' || categoryStatus === 'registration'}
              tournamentScoringFormat={(tournamentScoring.scoring_format ?? 'rally') as 'rally' | 'traditional'}
              tournamentNumSets={(tournamentScoring.num_sets ?? 1) as 1 | 3 | 5}
              tournamentPointsPerSet={tournamentScoring.points_per_set ?? 11}
              tournamentWinBy={((tournamentScoring as { win_by?: number }).win_by ?? 2) as 1 | 2}
              tournamentDeuceCap={(tournamentScoring as { deuce_cap?: number | null }).deuce_cap ?? null}
              currentScoringOverride={(category as { scoring_override?: boolean }).scoring_override ?? false}
              currentScoringFormat={((category as { scoring_format?: string | null }).scoring_format ?? null) as 'rally' | 'traditional' | null}
              currentNumSets={((category as { num_sets?: number | null }).num_sets ?? null) as 1 | 3 | 5 | null}
              currentPointsPerSet={(category as { points_per_set?: number | null }).points_per_set ?? null}
              currentWinBy={((category as { win_by?: number | null }).win_by ?? null) as 1 | 2 | null}
              currentDeuceCap={(category as { deuce_cap?: number | null }).deuce_cap ?? null}
              drawFormat={drawFormat}
              currentGroupsCount={(category as { groups_count?: number | null }).groups_count ?? null}
              currentAdvancePerGroup={(category as { advance_per_group?: number }).advance_per_group ?? 2}
              currentHasThirdPlaceMatch={(category as { has_third_place_match?: boolean }).has_third_place_match ?? false}
              currentKnockoutSeeding={(category as { knockout_seeding?: 'auto' | 'manual' }).knockout_seeding ?? 'auto'}
            />
          </div>
        </div>

        {/* Entry list — grouped standings for rr/swiss/group formats, flat otherwise */}
        <section className="mb-8">
          {showGroupStandings ? (
            // StandingsTable renders its own section header ("Groups" / "Standings")
            // and shows all players even before matches are played.
            <StandingsTable
              matches={matches}
              format={drawFormat}
              advancePerGroup={
                drawFormat === 'group_stage_knockout'
                  ? ((category as { advance_per_group?: number }).advance_per_group ?? 2)
                  : undefined
              }
            />
          ) : (
            <>
              <h2 className="mb-3 text-sm font-semibold text-slate-400 uppercase tracking-wide">
                Entries
              </h2>
              <EntryList
                entries={typedEntries}
                tournamentId={tournament.id}
                playFormat={(category as { play_format: string }).play_format as 'singles' | 'doubles' | 'mixed_doubles'}
              />
            </>
          )}
        </section>

        {/* Add / import players */}
        {categoryStatus === 'pending' || categoryStatus === 'registration' ? (
          <>
            <section className="mb-6">
              <AddPlayerByEmail
                tournamentId={tournament.id}
                categoryId={categoryId}
                playFormat={(category as { play_format: string }).play_format as 'singles' | 'doubles' | 'mixed_doubles'}
              />
            </section>
            <section className="mb-10">
              <ImportPlayersPanel tournamentId={tournament.id} categoryId={categoryId} />
            </section>
          </>
        ) : (
          <div className="mb-10 rounded-lg border border-slate-800 bg-surface-card px-4 py-3 text-xs text-slate-500">
            Entry list is locked — draw has been generated. Regenerate the draw to make changes.
          </div>
        )}

        <div className="mb-8 border-t border-surface-border" />

        {/* Seeding — only shown before draw is generated */}
        {(categoryStatus === 'pending' || categoryStatus === 'registration') && entryCount >= 2 && (
          <SeedingPanel
            entries={typedEntries}
            categoryId={categoryId}
            tournamentId={tournament.id}
          />
        )}

        <div className="mb-8 border-t border-surface-border" />

        <DrawSection
          categoryId={categoryId}
          categorySlug={catSlug}
          tournamentSlug={tournamentSlug}
          drawFormat={drawFormat}
          categoryStatus={categoryStatus}
          entryCount={entryCount}
          initialMatches={matches}
          showStandings={false}
          stalenessInfo={{ withdrawnInDraw, unplacedActive }}
          shareOnSocialEnabled={canShareOnSocial}
          groupStageConfig={drawFormat === 'group_stage_knockout' ? {
            groupsCount: (category as { groups_count?: number | null }).groups_count ?? null,
            advancePerGroup: (category as { advance_per_group?: number }).advance_per_group ?? 2,
            hasThirdPlaceMatch: (category as { has_third_place_match?: boolean }).has_third_place_match ?? false,
            knockoutSeeding: (category as { knockout_seeding?: 'auto' | 'manual' }).knockout_seeding ?? 'auto',
          } : undefined}
        />

        {/* Stage scoring overrides — shown for elimination-type formats */}
        {['single_elimination', 'double_elimination', 'group_stage_knockout'].includes(drawFormat) && (
          <section className="mt-8">
            <StageScoringPanel
              categoryId={categoryId}
              drawFormat={drawFormat}
              initialRows={stageRows}
              tournamentStageRows={tournamentStageRows}
              effectiveNumSets={
                ((category as { scoring_override?: boolean }).scoring_override
                  ? (category as { num_sets?: number | null }).num_sets
                  : null) ?? tournamentScoring.num_sets ?? 1
              }
              effectivePointsPerSet={
                ((category as { scoring_override?: boolean }).scoring_override
                  ? (category as { points_per_set?: number | null }).points_per_set
                  : null) ?? tournamentScoring.points_per_set ?? 11
              }
              effectiveWinBy={
                ((category as { scoring_override?: boolean }).scoring_override
                  ? (category as { win_by?: number | null }).win_by
                  : null) ?? (tournamentScoring as { win_by?: number }).win_by ?? 2
              }
              effectiveDeuceCap={
                ((category as { scoring_override?: boolean }).scoring_override
                  ? (category as { deuce_cap?: number | null }).deuce_cap
                  : undefined) ?? (tournamentScoring as { deuce_cap?: number | null }).deuce_cap ?? null
              }
            />
          </section>
        )}
      </main>
    </div>
  );
}
