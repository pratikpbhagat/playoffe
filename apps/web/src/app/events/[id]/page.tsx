import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { unstable_cache } from 'next/cache';
import { createAdminClient, createClient, getCurrentUser } from '@/lib/supabase/server';
import { checkPermission } from '@/lib/permissions';
import { AppNav } from '@/components/layout/AppNav';
import { PublicCategoryCard } from '@/components/events/PublicCategoryCard';
import { DeadlineCountdown } from '@/components/events/DeadlineCountdown';
import { RegistrationQR } from '@/components/ui/RegistrationQR';
import { AnnouncementBanner } from '@/components/events/AnnouncementBanner';
import { getActiveAnnouncementsAction } from '@/lib/actions/announcements';

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id: slug } = await params;
  const admin = createAdminClient();
  const { data: t } = await admin
    .from('tournaments')
    .select('name, description, start_date, venue, clubs(name)')
    .eq('slug', slug)
    .single();
  if (!t) return { title: 'Tournament not found' };
  const club = t.clubs as { name: string } | null;
  const title = `${t.name} · ${club?.name ?? 'PLAYOFFE'}`;
  const description = t.description
    ?? `${t.name} — pickleball tournament${t.venue ? ` at ${t.venue}` : ''}. Register and compete on PLAYOFFE.`;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      siteName: 'PLAYOFFE',
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
  };
}

const STATUS_BANNER: Record<string, { label: string; className: string }> = {
  draft:             { label: 'Not yet open',       className: 'bg-slate-700/50 text-slate-400' },
  registration_open: { label: 'Registration open',  className: 'bg-blue-900/60 text-blue-300' },
  in_progress:       { label: 'In progress',        className: 'bg-accent-500/20 text-accent-400' },
  completed:         { label: 'Completed',          className: 'bg-brand-600/20 text-brand-300' },
  cancelled:         { label: 'Cancelled',          className: 'bg-red-900/40 text-red-400' },
};

const PLAY_FORMAT_LABEL: Record<string, string> = {
  singles:       'Singles',
  doubles:       'Doubles',
  mixed_doubles: 'Mixed doubles',
};

const DRAW_FORMAT_LABEL: Record<string, string> = {
  round_robin:          'Round robin',
  single_elimination:   'Single elimination',
  double_elimination:   'Double elimination',
  group_stage_knockout: 'Group stage + knockout',
  swiss:                'Swiss',
};

// Public tournament data — same for every visitor, cache for 60 s so scores
// and registrations reflect recent changes without a full DB hit per request.
// Invalidated immediately by scoring/draw actions via revalidateTag('event-{slug}').
type CatRow = { id: string; name: string; slug: string; play_format: string; draw_format: string; status: string; max_entries: number | null };
type MatchProgressRow = { category_id: string; status: string };

async function getPublicTournamentData(slug: string) {
  const admin = createAdminClient();

  const { data: t } = await admin
    .from('tournaments')
    .select(`
      id, name, description, start_date, end_date, venue, status,
      registration_deadline, court_count, display_code, auto_approve_entries,
      clubs!inner(id, name, brand_primary_color)
    `)
    .eq('slug', slug)
    .neq('status', 'cancelled')
    .single();

  if (!t) return null;

  const [{ data: categories }, { data: entryCounts }] = await Promise.all([
    admin.from('tournament_categories').select('id, name, slug, play_format, draw_format, status, max_entries').eq('tournament_id', t.id).order('created_at'),
    admin.from('tournament_entries').select('category_id').eq('tournament_id', t.id).eq('status', 'active'),
  ]);

  const countByCategory: Record<string, number> = {};
  for (const e of entryCounts ?? []) {
    countByCategory[e.category_id] = (countByCategory[e.category_id] ?? 0) + 1;
  }

  const standingsFormats = new Set(['round_robin', 'swiss', 'group_stage_knockout']);
  const standingsCatIds = (categories ?? [])
    .filter((c) => standingsFormats.has(c.draw_format) && ['draw_generated', 'in_progress', 'completed'].includes(c.status))
    .map((c) => c.id);

  let matchProgressRaw: MatchProgressRow[] = [];
  if (standingsCatIds.length > 0) {
    const { data: mpRows } = await admin
      .from('matches')
      .select('category_id, status')
      .in('category_id', standingsCatIds)
      .not('entry_a_id', 'is', null)
      .not('entry_b_id', 'is', null);
    matchProgressRaw = (mpRows ?? []) as MatchProgressRow[];
  }

  const matchProgress: Record<string, { total: number; completed: number }> = {};
  for (const m of matchProgressRaw) {
    if (!matchProgress[m.category_id]) matchProgress[m.category_id] = { total: 0, completed: 0 };
    matchProgress[m.category_id].total++;
    if (m.status === 'completed' || m.status === 'walkover') matchProgress[m.category_id].completed++;
  }

  return { t, categories: (categories ?? []) as CatRow[], countByCategory, matchProgress };
}

const getCachedTournamentData = unstable_cache(
  getPublicTournamentData,
  ['public-tournament'],
  { revalidate: 60, tags: ['public-tournament'] },
);

export default async function PublicTournamentPage({ params }: Props) {
  const { id: slug } = await params;

  const publicData = await getCachedTournamentData(slug);
  if (!publicData) notFound();

  const { t, categories: cats, countByCategory, matchProgress } = publicData;
  const tournamentId = t.id;
  const club = t.clubs as { id: string; name: string; brand_primary_color: string };
  const banner = STATUS_BANNER[t.status] ?? STATUS_BANNER.draft;

  // Who is the current viewer? (dynamic — not cached, user-specific)
  const admin = createAdminClient();
  const supabase = await createClient();
  const user = await getCurrentUser();

  let myEntries: Record<string, string> = {}; // categoryId → status
  if (user) {
    const { data: myRows } = await admin
      .from('tournament_entries')
      .select('category_id, status')
      .eq('tournament_id', tournamentId)
      .eq('player_id', user.id)
      .not('status', 'eq', 'withdrawn');
    for (const r of myRows ?? []) {
      myEntries[r.category_id] = r.status;
    }
  }

  // Permission: can players withdraw their own entries?
  const canPlayerWithdraw = await checkPermission('player', 'entries', 'withdraw', club.id);

  const fmt = (d: string) =>
    new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
  const dateStr = t.start_date === t.end_date
    ? fmt(t.start_date)
    : `${fmt(t.start_date)} – ${fmt(t.end_date)}`;

  const deadlinePassed = t.registration_deadline
    ? new Date() > new Date(t.registration_deadline)
    : false;

  const registrationOpen =
    t.status === 'registration_open' && !deadlinePassed;

  // Active (non-archived) announcements for this tournament
  const activeAnnouncements = await getActiveAnnouncementsAction(tournamentId);

  return (
    <div className="min-h-screen bg-surface">
      <AppNav />

      <main className="mx-auto max-w-4xl px-6 py-10">
        {/* Breadcrumb */}
        <nav className="mb-6 flex items-center gap-2 text-xs text-slate-500 sm:text-sm">
          <Link href="/events" className="hover:text-slate-300 transition-colors">
            Tournaments
          </Link>
          <span>/</span>
          <span className="text-slate-400">{t.name}</span>
        </nav>

        {/* Header */}
        <div className="overflow-hidden rounded-2xl bg-surface-card ring-1 ring-surface-border">
          {/* Color bar */}
          <div className="h-2" style={{ backgroundColor: club.brand_primary_color }} />

          <div className="px-8 py-7">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500 mb-1">{club.name}</p>
                <h1 className="text-2xl font-bold text-white">{t.name}</h1>
                <div className="mt-2 flex items-center gap-3 flex-wrap">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${banner.className}`}>
                    {banner.label}
                  </span>
                  {t.registration_deadline && t.status === 'registration_open' && (
                    deadlinePassed
                      ? <span className="text-xs text-red-400">⛔ Registration closed</span>
                      : <DeadlineCountdown deadline={t.registration_deadline} />
                  )}
                </div>
              </div>

              {/* Action buttons */}
              <div className="shrink-0 flex items-center gap-2 flex-wrap">
                {(t.status === 'in_progress' || t.status === 'registration_open') && (
                  <Link
                    href={`/display/${t.display_code}`}
                    target="_blank"
                    className="flex items-center gap-2 rounded-lg border border-surface-border px-3 py-2 text-xs text-slate-400 hover:bg-surface hover:text-white transition-colors"
                  >
                    📺 Live display
                  </Link>
                )}
                {(t.status === 'in_progress' || t.status === 'completed') && (
                  <a
                    href={`/api/tournaments/${slug}/schedule.ics`}
                    download
                    className="flex items-center gap-1.5 rounded-lg border border-surface-border px-3 py-2 text-xs text-slate-400 hover:bg-surface hover:text-white transition-colors"
                  >
                    🗓 Add to calendar
                  </a>
                )}
              </div>
            </div>

            {/* Details */}
            <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-400">
              <span>📅 {dateStr}</span>
              {t.venue && <span>📍 {t.venue}</span>}
              <span>🏓 {t.court_count} court{t.court_count !== 1 ? 's' : ''}</span>
            </div>

            {t.description && (
              <p className="mt-4 text-sm leading-relaxed text-slate-400">{t.description}</p>
            )}
          </div>
        </div>

        {/* Announcements */}
        {activeAnnouncements.length > 0 && (
          <div className="mt-6">
            <AnnouncementBanner announcements={activeAnnouncements} />
          </div>
        )}

        {/* Categories */}
        <section className="mt-8">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-slate-500">
            Categories
          </h2>

          {cats.length === 0 ? (
            <div className="rounded-xl bg-surface-card p-8 text-center ring-1 ring-surface-border">
              <p className="text-sm text-slate-500">No categories have been added yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {cats.map((cat) => (
                <PublicCategoryCard
                  key={cat.id}
                  tournamentSlug={slug}
                  category={cat}
                  entryCount={countByCategory[cat.id] ?? 0}
                  myStatus={myEntries[cat.id] ?? null}
                  registrationOpen={registrationOpen}
                  isLoggedIn={!!user}
                  playFormatLabel={PLAY_FORMAT_LABEL[cat.play_format] ?? cat.play_format}
                  drawFormatLabel={DRAW_FORMAT_LABEL[cat.draw_format] ?? cat.draw_format}
                  matchProgress={matchProgress[cat.id] ?? null}
                  canWithdraw={canPlayerWithdraw}
                />
              ))}
            </div>
          )}
        </section>

        {/* Not logged in CTA */}
        {!user && registrationOpen && cats.length > 0 && (
          <div className="mt-6 rounded-xl bg-brand-900/30 px-6 py-5 ring-1 ring-brand-700/40 text-center">
            <p className="text-sm font-medium text-white">Want to compete?</p>
            <p className="mt-1 text-xs text-slate-400">Create a free account to register for any category.</p>
            <div className="mt-4 flex justify-center gap-3">
              <Link
                href={`/register?return=/events/${slug}`}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
              >
                Create account
              </Link>
              <Link
                href={`/login?return=/events/${slug}`}
                className="rounded-lg border border-surface-border px-4 py-2 text-sm text-slate-300 hover:bg-surface-card transition-colors"
              >
                Log in
              </Link>
            </div>
          </div>
        )}

        {/* QR code for sharing */}
        {registrationOpen && (
          <div className="mt-8">
            <RegistrationQR
              url={`${process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'}/events/${slug}`}
              label={`Register for ${t.name}`}
            />
          </div>
        )}
      </main>
    </div>
  );
}
