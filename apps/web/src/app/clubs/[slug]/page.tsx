import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { AppNav } from '@/components/layout/AppNav';
import { ClubManagersPanel } from '@/components/clubs/ClubManagersPanel';
import { ClubAdminNav } from '@/components/clubs/ClubAdminNav';
import { DigestButton } from '@/components/clubs/DigestButton';
import { getClubManagers } from '@/lib/actions/clubs';

export const metadata: Metadata = { title: 'Club' };

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function ClubPage({ params }: Props) {
  const { slug } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();

  // Fetch club by slug + verify caller is a manager
  const { data: club } = await admin
    .from('clubs')
    .select('*, club_managers!inner(role, player_id)')
    .eq('slug', slug)
    .eq('club_managers.player_id', user.id)
    .single();

  if (!club) notFound();

  const role = (club.club_managers as { role: string }[])[0]?.role ?? 'manager';
  const isOwner = role === 'owner';

  // Fetch this club's tournaments, managers, and quick stats in parallel.
  const [
    { data: tournaments },
    managers,
    { count: totalMembers },
    { count: activeTournamentsCount },
    { count: allTournamentsCount },
  ] = await Promise.all([
    admin
      .from('tournaments')
      .select('id, name, slug, status, start_date, end_date, display_code')
      .eq('club_id', club.id)
      .order('start_date', { ascending: false }),
    getClubManagers(club.id),
    admin
      .from('club_affiliations')
      .select('player_id', { count: 'exact', head: true })
      .eq('club_id', club.id)
      .eq('is_current', true),
    admin
      .from('tournaments')
      .select('id', { count: 'exact', head: true })
      .eq('club_id', club.id)
      .in('status', ['registration_open', 'in_progress']),
    admin
      .from('tournaments')
      .select('id', { count: 'exact', head: true })
      .eq('club_id', club.id),
  ]);

  return (
    <div className="min-h-screen bg-surface">
      <AppNav />

      <main className="mx-auto max-w-6xl px-6 py-10">
        {/* Club header */}
        <div className="mb-8">
          {/* Top row: logo + name always full width on mobile, side-by-side with buttons on sm+ */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div
                className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl text-xl font-black text-white shadow"
                style={{ backgroundColor: club.brand_primary_color }}
              >
                {club.name[0]}
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">{club.name}</h1>
                <p className="mt-0.5 text-sm text-slate-400">
                  {[club.city, club.location].filter(Boolean).join(' · ')}
                  {role === 'owner' && (
                    <span className="ml-2 rounded-full bg-brand-600/20 px-2 py-0.5 text-xs font-medium text-brand-300">
                      Owner
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* Desktop buttons — hidden on mobile */}
            <div className="hidden sm:flex items-center gap-3">
              <Link
                href={`/c/${club.slug}`}
                className="whitespace-nowrap rounded-lg border border-surface-border px-4 py-2 text-sm font-medium text-slate-400 hover:bg-surface hover:text-white transition-colors"
                title="View public profile"
              >
                Public page ↗
              </Link>
              <DigestButton clubId={club.id} />
              <Link
                href={`/tournaments/new?club=${club.id}`}
                className="whitespace-nowrap rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
              >
                + New tournament
              </Link>
            </div>
          </div>

          {/* Mobile buttons — shown below header on small screens */}
          <div className="mt-4 flex flex-col gap-2 sm:hidden">
            {/* Primary action — full width */}
            <Link
              href={`/tournaments/new?club=${club.id}`}
              className="w-full text-center rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
            >
              + New tournament
            </Link>
            {/* Secondary actions — split row */}
            <div className="flex gap-2">
              <Link
                href={`/c/${club.slug}`}
                className="flex-1 text-center whitespace-nowrap rounded-lg border border-surface-border px-3 py-2 text-xs font-medium text-slate-400 hover:bg-surface hover:text-white transition-colors"
              >
                Public page ↗
              </Link>
              <div className="flex-1"><DigestButton clubId={club.id} /></div>
            </div>
          </div>
        </div>

        {club.description && (
          <p className="mb-6 text-sm text-slate-400">{club.description}</p>
        )}

        {/* Tab nav */}
        <ClubAdminNav clubSlug={slug} activeTab="overview" isOwner={isOwner} />

        {/* Quick stats */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            { label: 'Total members', value: (totalMembers ?? 0).toString() },
            { label: 'Active tournaments', value: (activeTournamentsCount ?? 0).toString() },
            { label: 'All-time tournaments', value: (allTournamentsCount ?? 0).toString() },
          ].map((s) => (
            <div key={s.label} className="rounded-xl bg-surface-card p-5 ring-1 ring-surface-border">
              <p className="text-2xl font-bold text-white">{s.value}</p>
              <p className="mt-1 text-xs text-slate-500">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Tournaments */}
        <div>
          <h2 className="mb-4 text-base font-semibold text-white">Tournaments</h2>

          {!tournaments || tournaments.length === 0 ? (
            <div className="rounded-xl bg-surface-card p-8 text-center ring-1 ring-surface-border">
              <p className="text-sm text-slate-500">
                No tournaments yet.{' '}
                <Link
                  href={`/tournaments/new?club=${club.id}`}
                  className="text-brand-400 hover:text-brand-300"
                >
                  Create your first one →
                </Link>
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {tournaments.map((t) => (
                <Link
                  key={t.id}
                  href={`/tournaments/${(t as unknown as { slug: string }).slug}`}
                  className="flex items-center justify-between rounded-xl bg-surface-card px-5 py-4 ring-1 ring-surface-border hover:ring-brand-500/40 transition-all"
                >
                  <div>
                    <p className="text-sm font-semibold text-white">{t.name}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {new Date(t.start_date).toLocaleDateString('en-AU', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                      {t.end_date !== t.start_date &&
                        ` – ${new Date(t.end_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                    </p>
                  </div>
                  <StatusBadge status={t.status} />
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Club managers */}
        <ClubManagersPanel
          clubId={club.id}
          managers={managers}
          isOwner={isOwner}
          currentUserId={user.id}
        />
      </main>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    draft: { label: 'Draft', className: 'bg-slate-700 text-slate-300' },
    registration_open: { label: 'Registration open', className: 'bg-blue-900/60 text-blue-300' },
    in_progress: { label: 'In progress', className: 'bg-accent-500/20 text-accent-400' },
    completed: { label: 'Completed', className: 'bg-brand-600/20 text-brand-300' },
    cancelled: { label: 'Cancelled', className: 'bg-red-900/40 text-red-400' },
  };
  const { label, className } = map[status] ?? map.draft;
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}>{label}</span>
  );
}
