import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { createClient, createAdminClient, getUserRoles } from '@/lib/supabase/server';
import { AppNav } from '@/components/layout/AppNav';
import { DisplayControlPanel } from '@/components/display/DisplayControlPanel';

export const metadata: Metadata = { title: 'Display Control' };

interface Props {
  params: Promise<{ id: string }>;
}

export default async function DisplayControlPage({ params }: Props) {
  const { id: slug } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();

  const { data: t } = await admin
    .from('tournaments')
    .select('id, name, club_id, display_code')
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

  // Load current display state
  const { data: ds } = await admin
    .from('display_state')
    .select('*')
    .eq('tournament_id', t.id)
    .single();

  // Load active announcements
  const { data: announcements } = await admin
    .from('announcements')
    .select('*')
    .eq('tournament_id', t.id)
    .is('dismissed_at', null)
    .order('sent_at', { ascending: false });

  if (!ds) notFound();

  return (
    <div className="min-h-screen bg-surface">
      <AppNav />

      <main className="mx-auto max-w-4xl px-6 py-10">
        <nav className="mb-6 flex items-center gap-2 text-xs text-slate-500 sm:text-sm">
          <Link href={`/tournaments/${slug}`} className="hover:text-slate-300 transition-colors">
            {t.name}
          </Link>
          <span>/</span>
          <span className="text-slate-400">Display control</span>
        </nav>

        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">Display control</h1>
          <Link
            href={`/display/${t.display_code}`}
            target="_blank"
            className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
          >
            <span>📺</span> Open display
          </Link>
        </div>

        <DisplayControlPanel
          tournamentId={t.id}
          tournamentSlug={slug}
          displayCode={t.display_code as string}
          initialDisplayState={ds}
          initialAnnouncements={announcements ?? []}
        />
      </main>
    </div>
  );
}
