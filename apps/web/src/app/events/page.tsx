import type { Metadata } from 'next';
import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/server';
import { AppNav } from '@/components/layout/AppNav';
import { EventSearchInput } from '@/components/events/EventSearchInput';

export const metadata: Metadata = {
  title: 'Find tournaments · PLAYOFFE',
  description: 'Browse upcoming pickleball tournaments, register to compete, and track live standings on PLAYOFFE.',
  openGraph: {
    title: 'Find tournaments · PLAYOFFE',
    description: 'Browse upcoming pickleball tournaments, register to compete, and track live standings on PLAYOFFE.',
    type: 'website',
    siteName: 'PLAYOFFE',
  },
};

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  registration_open: { label: 'Registration open', className: 'bg-blue-900/60 text-blue-300' },
  in_progress:       { label: 'In progress',       className: 'bg-accent-500/20 text-accent-400' },
  completed:         { label: 'Completed',          className: 'bg-slate-700/50 text-slate-400' },
  draft:             { label: 'Coming soon',        className: 'bg-slate-700/50 text-slate-500' },
};

const FORMAT_LABEL: Record<string, string> = {
  singles:       'Singles',
  doubles:       'Doubles',
  mixed_doubles: 'Mixed doubles',
};

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; format?: string; status?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? '').toLowerCase().trim();
  const filterFormat = sp.format ?? 'all';
  const filterStatus = sp.status ?? 'all';

  const admin = createAdminClient();

  // Fetch public tournaments (not cancelled, show upcoming and recent)
  let tournamentsQuery = admin
    .from('tournaments')
    .select(`
      id, name, slug, start_date, end_date, venue, status, registration_deadline,
      clubs!inner(id, name, brand_primary_color),
      tournament_categories(id, play_format, status, max_entries)
    `)
    .not('status', 'eq', 'cancelled')
    .order('start_date', { ascending: true })
    .limit(200);

  // Push the status filter down to the DB when set, instead of fetching every row.
  if (filterStatus !== 'all') {
    tournamentsQuery = tournamentsQuery.eq('status', filterStatus);
  }

  const { data: tournaments } = await tournamentsQuery;

  const allRows = (tournaments ?? []) as Array<{
    id: string;
    name: string;
    slug: string;
    start_date: string;
    end_date: string;
    venue: string | null;
    status: string;
    registration_deadline: string | null;
    clubs: { id: string; name: string; brand_primary_color: string };
    tournament_categories: Array<{ id: string; play_format: string; status: string; max_entries: number | null }>;
  }>;

  // Apply filters
  const rows = allRows.filter((t) => {
    if (q && !t.name.toLowerCase().includes(q) && !(t.venue ?? '').toLowerCase().includes(q) && !(t.clubs as {name:string}).name.toLowerCase().includes(q)) return false;
    if (filterFormat !== 'all' && !t.tournament_categories.some((c) => c.play_format === filterFormat)) return false;
    if (filterStatus !== 'all' && t.status !== filterStatus) return false;
    return true;
  });

  // Separate: open registration, upcoming, past
  const open      = rows.filter((t) => t.status === 'registration_open');
  const upcoming  = rows.filter((t) => t.status === 'draft');
  const active    = rows.filter((t) => t.status === 'in_progress');
  const completed = rows.filter((t) => t.status === 'completed');

  function TournamentCard({ t }: { t: typeof rows[number] }) {
    const badge = STATUS_BADGE[t.status] ?? STATUS_BADGE.draft;
    const club = t.clubs;
    const formats = [...new Set(t.tournament_categories.map((c) => FORMAT_LABEL[c.play_format] ?? c.play_format))];
    const categoryCount = t.tournament_categories.length;
    const deadlinePassed = t.registration_deadline
      ? new Date() > new Date(t.registration_deadline)
      : false;

    const fmt = (d: string) =>
      new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
    const dateStr = t.start_date === t.end_date
      ? fmt(t.start_date)
      : `${fmt(t.start_date)} – ${fmt(t.end_date)}`;

    return (
      <Link
        href={`/events/${t.slug}`}
        className="group flex flex-col rounded-2xl bg-surface-card ring-1 ring-surface-border hover:ring-brand-500/40 transition-all overflow-hidden"
      >
        {/* Colour bar */}
        <div className="h-1.5 w-full" style={{ backgroundColor: club.brand_primary_color }} />

        <div className="flex flex-1 flex-col p-6">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-500 mb-1">{club.name}</p>
              <h3 className="text-base font-bold text-white leading-snug group-hover:text-brand-300 transition-colors">
                {t.name}
              </h3>
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}>
              {badge.label}
            </span>
          </div>

          {/* Meta */}
          <div className="mt-3 space-y-1">
            <p className="text-sm text-slate-400">{dateStr}</p>
            {t.venue && <p className="text-xs text-slate-500">📍 {t.venue}</p>}
          </div>

          {/* Formats */}
          {formats.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {formats.map((f) => (
                <span key={f} className="rounded bg-surface px-2 py-0.5 text-xs text-slate-400">
                  {f}
                </span>
              ))}
              <span className="rounded bg-surface px-2 py-0.5 text-xs text-slate-500">
                {categoryCount} {categoryCount === 1 ? 'category' : 'categories'}
              </span>
            </div>
          )}

          {/* Registration deadline */}
          {t.registration_deadline && t.status === 'registration_open' && (
            <p className={`mt-3 text-xs ${deadlinePassed ? 'text-red-400' : 'text-slate-500'}`}>
              {deadlinePassed
                ? 'Registration closed'
                : `Closes ${fmt(t.registration_deadline)}`}
            </p>
          )}
        </div>
      </Link>
    );
  }

  return (
    <div className="min-h-screen bg-surface">
      <AppNav />

      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">Find a tournament</h1>
          <p className="mt-1 text-sm text-slate-500">
            Browse upcoming PLAYOFFE events and register to compete.
          </p>
        </div>

        {/* Search & filter bar */}
        <form method="GET" className="mb-8 flex flex-wrap gap-3">
          <EventSearchInput defaultValue={sp.q ?? ''} />
          <select
            name="format"
            defaultValue={filterFormat}
            className="rounded-lg border border-surface-border bg-surface-card px-3 py-2 text-sm text-slate-300 focus:border-brand-500 focus:outline-none"
          >
            <option value="all">All formats</option>
            <option value="singles">Singles</option>
            <option value="doubles">Doubles</option>
            <option value="mixed_doubles">Mixed doubles</option>
          </select>
          <select
            name="status"
            defaultValue={filterStatus}
            className="rounded-lg border border-surface-border bg-surface-card px-3 py-2 text-sm text-slate-300 focus:border-brand-500 focus:outline-none"
          >
            <option value="all">All statuses</option>
            <option value="registration_open">Registration open</option>
            <option value="in_progress">In progress</option>
            <option value="draft">Coming soon</option>
            <option value="completed">Completed</option>
          </select>
          <button
            type="submit"
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
          >
            Search
          </button>
          {(q || filterFormat !== 'all' || filterStatus !== 'all') && (
            <a
              href="/events"
              className="rounded-lg border border-surface-border px-4 py-2 text-sm text-slate-400 hover:text-slate-300 transition-colors"
            >
              Clear
            </a>
          )}
        </form>


        {rows.length === 0 && (
          <div className="rounded-xl bg-surface-card p-16 text-center ring-1 ring-surface-border">
            <p className="text-4xl mb-3">🏓</p>
            {q || filterFormat !== 'all' || filterStatus !== 'all' ? (
              <>
                <p className="text-base font-medium text-white">No tournaments match your search</p>
                <p className="mt-1 text-sm text-slate-500">Try adjusting your filters or <a href="/events" className="text-brand-400 hover:text-brand-300">clear all</a>.</p>
              </>
            ) : (
              <>
                <p className="text-base font-medium text-white">No tournaments yet</p>
                <p className="mt-1 text-sm text-slate-500">Check back soon — events will appear here.</p>
              </>
            )}
          </div>
        )}

        {/* Registration open */}
        {open.length > 0 && (
          <section className="mb-10">
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-blue-400">
              Registration open
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {open.map((t) => <TournamentCard key={t.id} t={t} />)}
            </div>
          </section>
        )}

        {/* In progress */}
        {active.length > 0 && (
          <section className="mb-10">
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-accent-400">
              Happening now
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {active.map((t) => <TournamentCard key={t.id} t={t} />)}
            </div>
          </section>
        )}

        {/* Coming soon */}
        {upcoming.length > 0 && (
          <section className="mb-10">
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-slate-500">
              Coming soon
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {upcoming.map((t) => <TournamentCard key={t.id} t={t} />)}
            </div>
          </section>
        )}

        {/* Completed */}
        {completed.length > 0 && (
          <section>
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-slate-600">
              Past events
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 opacity-60">
              {completed.map((t) => <TournamentCard key={t.id} t={t} />)}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
