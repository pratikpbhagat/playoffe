import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { AppNav } from '@/components/layout/AppNav';
import { EntryList } from '@/components/tournaments/EntryList';
import { AddPlayerByEmail } from '@/components/tournaments/AddPlayerByEmail';
import { ImportPlayersPanel } from '@/components/tournaments/ImportPlayersPanel';
import { DrawSection } from '@/components/tournaments/DrawSection';
import { CategoryEditInline } from '@/components/tournaments/CategoryEditInline';
import { getCategoryWithEntries } from '@/lib/actions/categories';
import { getMatchesForCategory } from '@/lib/actions/draws';

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

  if (!tournament) notFound();

  // Verify manager access
  const { data: mgr } = await admin
    .from('club_managers')
    .select('role')
    .eq('club_id', tournament.club_id)
    .eq('player_id', user.id)
    .maybeSingle();
  if (!mgr) notFound();

  // Look up category by slug + tournament_id
  const { data: categoryRow } = await admin
    .from('tournament_categories')
    .select('id')
    .eq('slug', catSlug)
    .eq('tournament_id', tournament.id)
    .single();

  if (!categoryRow) notFound();

  const categoryId = categoryRow.id;

  // Fetch category + entries + matches in parallel
  const [data, matches] = await Promise.all([
    getCategoryWithEntries(categoryId),
    getMatchesForCategory(categoryId),
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
  };
  const typedEntries = entries as unknown as EntryRow[];

  const entryCount = typedEntries.length;
  const maxEntries = (category as { max_entries: number | null }).max_entries;
  const categoryStatus = (category as { status: string }).status;
  const drawFormat = (category as { draw_format: string }).draw_format;

  return (
    <div className="min-h-screen bg-surface">
      <AppNav />

      <main className="mx-auto max-w-4xl px-6 py-10">
        {/* Breadcrumb */}
        <nav className="mb-6 flex items-center gap-2 text-sm text-slate-500 flex-wrap">
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

          <div className="flex items-start gap-3 shrink-0">
            <div className="rounded-xl bg-surface-card px-5 py-3 ring-1 ring-surface-border text-center">
              <p className="text-2xl font-bold text-white">{entryCount}</p>
              <p className="text-xs text-slate-500">
                {maxEntries ? `/ ${maxEntries} entries` : 'entries'}
              </p>
            </div>
            <CategoryEditInline
              categoryId={categoryId}
              currentName={category.name}
              currentMaxEntries={maxEntries}
              currentPlayFormat={(category as { play_format: string }).play_format}
              currentDrawFormat={(category as { draw_format: string }).draw_format}
              canEditFormats={categoryStatus === 'pending' || categoryStatus === 'registration'}
            />
          </div>
        </div>

        {/* Entry list */}
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold text-slate-400 uppercase tracking-wide">
            Entries
          </h2>
          <EntryList entries={typedEntries} tournamentId={tournament.id} />
        </section>

        {/* Add / import players */}
        {categoryStatus === 'pending' || categoryStatus === 'registration' ? (
          <>
            <section className="mb-6">
              <AddPlayerByEmail tournamentId={tournament.id} categoryId={categoryId} />
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

        <DrawSection
          categoryId={categoryId}
          tournamentSlug={tournamentSlug}
          drawFormat={drawFormat}
          categoryStatus={categoryStatus}
          entryCount={entryCount}
          initialMatches={matches}
        />
      </main>
    </div>
  );
}
