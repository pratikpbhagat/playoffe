import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { createClient, createAdminClient, getUserRoles } from '@/lib/supabase/server';
import { AppNav } from '@/components/layout/AppNav';
import { PendingEntriesPanel } from '@/components/tournaments/PendingEntriesPanel';
import { InvitePlayersPanel } from '@/components/tournaments/InvitePlayersPanel';

export const metadata: Metadata = { title: 'Registrations' };

interface Props {
  params: Promise<{ id: string }>;
}

export default async function RegistrationsPage({ params }: Props) {
  const { id: slug } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
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

  // Fetch all categories with their slugs
  const { data: categories } = await admin
    .from('tournament_categories')
    .select('id, name, slug, play_format, max_entries')
    .eq('tournament_id', t.id)
    .order('created_at');

  // Fetch all non-withdrawn entries with player + partner details
  const { data: entries } = await admin
    .from('tournament_entries')
    .select(`
      id, status, registered_at, category_id, seed,
      players!player_id(id, full_name, username, global_stats(current_rating)),
      partner:players!partner_id(full_name, username)
    `)
    .eq('tournament_id', t.id)
    .not('status', 'eq', 'withdrawn')
    .order('registered_at', { ascending: true });

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

  const cats = (categories ?? []) as Array<{ id: string; name: string; slug: string; play_format: string; max_entries: number | null }>;
  const pendingTotal = allEntries.filter((e) => e.status === 'pending').length;

  return (
    <div className="min-h-screen bg-surface">
      <AppNav />

      <main className="mx-auto max-w-4xl px-6 py-10">
        {/* Breadcrumb */}
        <nav className="mb-6 flex items-center gap-2 text-sm text-slate-500">
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

        {cats.length === 0 ? (
          <div className="rounded-xl bg-surface-card p-10 text-center ring-1 ring-surface-border">
            <p className="text-sm text-slate-500">No categories have been added to this tournament.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {cats.map((cat) => {
              const catEntries = entriesByCategory[cat.id] ?? [];
              return (
                <PendingEntriesPanel
                  key={cat.id}
                  tournamentSlug={slug}
                  tournamentId={t.id}
                  category={cat}
                  entries={catEntries}
                />
              );
            })}
          </div>
        )}
        {/* Invite players panel */}
        <InvitePlayersPanel tournamentId={t.id} />
      </main>
    </div>
  );
}
