import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { AppNav } from '@/components/layout/AppNav';
import { TournamentStatusControl } from '@/components/tournaments/TournamentStatusControl';
import type { TournamentStatus } from '@/lib/actions/tournaments';

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

const FORMAT_LABEL: Record<string, string> = {
  round_robin: 'Round robin',
  single_elimination: 'Single elimination',
  double_elimination: 'Double elimination',
  group_stage_knockout: 'Group stage + knockout',
  swiss: 'Swiss',
};

const PLAY_FORMAT_LABEL: Record<string, string> = {
  singles: 'Singles',
  doubles: 'Doubles',
  mixed_doubles: 'Mixed doubles',
};

export default async function TournamentPage({ params }: Props) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();

  const { data: t } = await admin
    .from('tournaments')
    .select('*, clubs!inner(id, name, brand_primary_color), tournament_categories(*)')
    .eq('id', id)
    .single();

  if (!t) notFound();

  // Verify user manages this club
  const { data: mgr } = await admin
    .from('club_managers')
    .select('role')
    .eq('club_id', (t.clubs as { id: string }).id)
    .eq('player_id', user.id)
    .maybeSingle();

  if (!mgr) notFound(); // not their tournament

  // Entry count per category
  const { data: entryCounts } = await admin
    .from('tournament_entries')
    .select('category_id')
    .eq('tournament_id', id)
    .eq('status', 'active');

  const countByCategory: Record<string, number> = {};
  for (const e of entryCounts ?? []) {
    countByCategory[e.category_id] = (countByCategory[e.category_id] ?? 0) + 1;
  }

  type Category = {
    id: string;
    name: string;
    play_format: string;
    draw_format: string;
    status: string;
    max_entries: number | null;
  };
  const categories = (t.tournament_categories as unknown as Category[]) ?? [];
  const club = t.clubs as { id: string; name: string; brand_primary_color: string };
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
        <nav className="mb-6 flex items-center gap-2 text-sm text-slate-500">
          <Link href={`/clubs/${club.id}`} className="hover:text-slate-300 transition-colors">
            {club.name}
          </Link>
          <span>/</span>
          <span className="text-slate-400">{t.name}</span>
        </nav>

        {/* Header */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-white">{t.name}</h1>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}
              >
                {badge.label}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-400">
              {dateRange}
              {t.venue && ` · ${t.venue}`}
              {` · ${t.court_count} court${t.court_count !== 1 ? 's' : ''}`}
            </p>
          </div>

          {/* Status transition control */}
          <TournamentStatusControl
            tournamentId={id}
            currentStatus={t.status as TournamentStatus}
          />
        </div>

        {/* Stat cards */}
        <div className="mb-10 grid gap-4 sm:grid-cols-4">
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

        {/* Quick links */}
        <div className="mb-10 flex flex-wrap gap-3">
          <Link
            href={`/display/${t.display_code}`}
            target="_blank"
            className="flex items-center gap-2 rounded-lg border border-surface-border px-4 py-2 text-sm text-slate-300 hover:bg-surface-card transition-colors"
          >
            <span>📺</span> Display screen
          </Link>
        </div>

        {/* Categories */}
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-white">Categories</h2>
            {/* Add category button — built in M2 */}
            <button
              disabled
              title="Coming in next milestone"
              className="rounded-lg bg-brand-600/30 px-3 py-1.5 text-xs font-medium text-brand-300 cursor-not-allowed"
            >
              + Add category
            </button>
          </div>

          {categories.length === 0 ? (
            <div className="rounded-xl bg-surface-card p-8 text-center ring-1 ring-surface-border">
              <p className="text-sm text-slate-500">
                No categories yet. Add a category to define how players will compete.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {categories.map((cat) => {
                const entryCount = countByCategory[cat.id] ?? 0;
                return (
                  <div
                    key={cat.id}
                    className="flex items-center justify-between rounded-xl bg-surface-card px-5 py-4 ring-1 ring-surface-border"
                  >
                    <div>
                      <p className="text-sm font-semibold text-white">{cat.name}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {PLAY_FORMAT_LABEL[cat.play_format] ?? cat.play_format} ·{' '}
                        {FORMAT_LABEL[cat.draw_format] ?? cat.draw_format}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 text-right">
                      <div>
                        <p className="text-sm font-semibold text-white">{entryCount}</p>
                        <p className="text-xs text-slate-500">
                          {cat.max_entries ? `/ ${cat.max_entries}` : 'entries'}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
