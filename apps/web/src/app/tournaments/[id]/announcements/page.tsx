import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { createClient, createAdminClient, getUserRoles } from '@/lib/supabase/server';
import { AppNav } from '@/components/layout/AppNav';
import { AnnouncementsPanel } from '@/components/tournaments/AnnouncementsPanel';
import { getAnnouncementsAction } from '@/lib/actions/announcements';

export const metadata: Metadata = { title: 'Announcements' };

interface Props {
  params: Promise<{ id: string }>;
}

export default async function TournamentAnnouncementsPage({ params }: Props) {
  const { id: slug } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?return=/tournaments/${slug}/announcements`);

  const admin = createAdminClient();

  const { data: t } = await admin
    .from('tournaments')
    .select('*, clubs!inner(id, name, slug, brand_primary_color)')
    .eq('slug', slug)
    .single();
  if (!t) notFound();

  const club = t.clubs as { id: string; name: string; slug: string; brand_primary_color: string };

  // Verify the user manages this club
  const { data: mgr } = await admin
    .from('club_managers')
    .select('role')
    .eq('club_id', club.id)
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

  const announcements = await getAnnouncementsAction(t.id);

  // Active entry count (shown as "X participants will be notified")
  const { count: participantCount } = await admin
    .from('tournament_entries')
    .select('id', { count: 'exact', head: true })
    .eq('tournament_id', t.id)
    .eq('status', 'active');

  return (
    <div className="min-h-screen bg-surface">
      <AppNav />

      <main className="mx-auto max-w-4xl px-6 py-10">
        {/* Breadcrumb */}
        <nav className="mb-6 flex items-center gap-2 text-xs text-slate-500 sm:text-sm">
          <Link href={`/clubs/${club.slug}`} className="hover:text-slate-300 transition-colors">
            {club.name}
          </Link>
          <span>/</span>
          <Link href={`/tournaments/${slug}`} className="hover:text-slate-300 transition-colors">
            {t.name}
          </Link>
          <span>/</span>
          <span className="text-slate-400">Announcements</span>
        </nav>

        {/* Header */}
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Announcements</h1>
            <p className="mt-1 text-sm text-slate-400">
              {participantCount ?? 0} active participant{participantCount !== 1 ? 's' : ''} will receive push notifications if enabled.
            </p>
          </div>
          <Link
            href={`/tournaments/${slug}`}
            className="rounded-lg border border-surface-border px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
          >
            ← Back
          </Link>
        </div>

        <AnnouncementsPanel
          tournamentId={t.id}
          tournamentSlug={slug}
          announcements={announcements}
        />
      </main>
    </div>
  );
}
