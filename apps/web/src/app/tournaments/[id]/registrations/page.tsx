import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { createAdminClient, getCurrentUser, getUserRoles } from '@/lib/supabase/server';
import { checkPermission } from '@/lib/permissions';
import { AppNav } from '@/components/layout/AppNav';
import { RegistrationsClient } from '@/components/tournaments/RegistrationsClient';
import { getTeamsForCategoryAction } from '@/lib/actions/teams';

export const metadata: Metadata = { title: 'Registrations' };

interface Props {
  params: Promise<{ id: string }>;
}

export default async function RegistrationsPage({ params }: Props) {
  const { id: slug } = await params;

  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();

  const { data: t } = await admin
    .from('tournaments')
    .select('id, name, club_id, auto_approve_entries')
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

  // Fetch categories, entries, and admin-withdraw permission in parallel.
  const [{ data: categories }, { data: entries }, canAdminWithdraw] = await Promise.all([
    admin
      .from('tournament_categories')
      .select('id, name, slug, play_format, max_entries, status')
      .eq('tournament_id', t.id)
      .order('created_at'),
    admin
      .from('tournament_entries')
      .select(`
        id, status, registered_at, category_id, seed,
        players!player_id(id, full_name, username, global_stats(current_rating)),
        partner:players!partner_id(full_name, username)
      `)
      .eq('tournament_id', t.id)
      .order('registered_at', { ascending: true }),
    checkPermission('admin', 'entries', 'withdraw', t.club_id),
  ]);

  type EntryRow = {
    id: string;
    status: string;
    registered_at: string;
    category_id: string;
    seed: number | null;
    players: {
      id: string;
      full_name: string;
      username: string;
      global_stats: { current_rating: number } | null;
    } | null;
    partner: { full_name: string; username: string } | null;
  };

  const allEntries = (entries ?? []) as unknown as EntryRow[];

  const entriesByCategory: Record<string, EntryRow[]> = {};
  for (const e of allEntries) {
    if (!entriesByCategory[e.category_id]) entriesByCategory[e.category_id] = [];
    entriesByCategory[e.category_id].push(e);
  }

  const cats = (categories ?? []) as Array<{ id: string; name: string; slug: string; play_format: string; max_entries: number | null; status: string }>;
  const pendingTotal = allEntries.filter((e) => e.status === 'pending').length;

  // Team-event categories don't use tournament_entries at all — fetch their
  // rosters (for the same TeamRosterList view used on the category page) and
  // each category's rubber lineup config (needed to render the per-rubber
  // default-lineup pickers). Per-tie editing/overriding lives on the
  // category page now, not here, so ties aren't needed on this page.
  const teamEventCatIds = cats.filter((c) => c.play_format === 'team_event').map((c) => c.id);
  const [teamsByCatEntries, rubberLineupByCatEntries] = await Promise.all([
    Promise.all(teamEventCatIds.map(async (id) => [id, await getTeamsForCategoryAction(id)] as const)),
    Promise.all(teamEventCatIds.map(async (id) => {
      const { data } = await admin.from('tournament_categories').select('rubber_lineup').eq('id', id).single();
      return [id, (data?.rubber_lineup ?? []) as { sequence: number; name: string; play_format: string }[]] as const;
    })),
  ]);
  const teamsByCategory = Object.fromEntries(teamsByCatEntries);
  const rubberLineupByCategory = Object.fromEntries(rubberLineupByCatEntries);

  return (
    <div className="min-h-screen bg-surface">
      <AppNav />

      <main className="mx-auto max-w-4xl px-6 py-10">
        {/* Breadcrumb */}
        <nav className="mb-6 flex items-center gap-2 text-xs text-slate-500 sm:text-sm">
          <Link href={`/tournaments/${slug}`} className="hover:text-slate-300 transition-colors">
            {t.name}
          </Link>
          <span>/</span>
          <span className="text-slate-400">Registrations</span>
        </nav>

        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Registrations</h1>
            {pendingTotal > 0 && (
              <p className="mt-1 text-sm text-amber-300">
                {pendingTotal} entr{pendingTotal === 1 ? 'y' : 'ies'} awaiting approval
              </p>
            )}
          </div>
          {t.auto_approve_entries && (
            <span className="rounded-full bg-accent-500/10 px-3 py-1 text-xs font-medium text-accent-400 ring-1 ring-accent-500/30">
              Auto-approve on
            </span>
          )}
        </div>

        <RegistrationsClient
          tournamentSlug={slug}
          tournamentId={t.id}
          categories={cats}
          allEntries={allEntries}
          canAdminWithdraw={canAdminWithdraw}
          teamsByCategory={teamsByCategory}
          rubberLineupByCategory={rubberLineupByCategory}
        />
      </main>
    </div>
  );
}
