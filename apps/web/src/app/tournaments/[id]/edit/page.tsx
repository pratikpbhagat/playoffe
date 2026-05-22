import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { AppNav } from '@/components/layout/AppNav';
import { TournamentForm } from '@/components/tournaments/TournamentForm';

export const metadata: Metadata = { title: 'Edit tournament' };

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditTournamentPage({ params }: Props) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();

  const { data: t } = await admin
    .from('tournaments')
    .select('*, clubs!inner(id, name, brand_primary_color)')
    .eq('id', id)
    .single();

  if (!t) notFound();

  // Verify manager access
  const club = t.clubs as { id: string; name: string; brand_primary_color: string };

  const { data: mgr } = await admin
    .from('club_managers')
    .select('role')
    .eq('club_id', club.id)
    .eq('player_id', user.id)
    .maybeSingle();

  if (!mgr) notFound();

  // Fetch all clubs this user manages (for the form's club dropdown, shown but disabled)
  const { data: managedClubs } = await admin
    .from('club_managers')
    .select('clubs(id, name)')
    .eq('player_id', user.id);

  const clubs = (managedClubs ?? [])
    .map((m) => m.clubs as { id: string; name: string } | null)
    .filter(Boolean) as { id: string; name: string }[];

  const defaultValues = {
    club_id: club.id,
    name: t.name,
    description: t.description,
    venue: t.venue,
    start_date: t.start_date,
    end_date: t.end_date,
    court_count: t.court_count,
    registration_deadline: t.registration_deadline,
    max_participants: t.max_participants,
    auto_approve_entries: t.auto_approve_entries ?? true,
  };

  return (
    <div className="min-h-screen bg-surface">
      <AppNav />

      <main className="mx-auto max-w-2xl px-6 py-10">
        {/* Breadcrumb */}
        <nav className="mb-6 flex items-center gap-2 text-sm text-slate-500">
          <Link href={`/tournaments/${id}`} className="hover:text-slate-300 transition-colors">
            {t.name}
          </Link>
          <span>/</span>
          <span className="text-slate-400">Edit</span>
        </nav>

        <h1 className="mb-8 text-2xl font-bold text-white">Edit tournament</h1>

        <div className="rounded-xl bg-surface-card p-6 ring-1 ring-surface-border">
          <TournamentForm
            clubs={clubs}
            mode="edit"
            tournamentId={id}
            defaultValues={defaultValues}
          />
        </div>
      </main>
    </div>
  );
}
