import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppNav } from '@/components/layout/AppNav';
import { TournamentForm } from '@/components/tournaments/TournamentForm';
import { getMyClubs } from '@/lib/actions/clubs';

export const metadata: Metadata = { title: 'New tournament' };

interface Props {
  searchParams: Promise<{ club?: string }>;
}

export default async function NewTournamentPage({ searchParams }: Props) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { club: defaultClubId } = await searchParams;
  const clubs = await getMyClubs();

  return (
    <div className="min-h-screen bg-surface">
      <AppNav />

      <main className="mx-auto max-w-2xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">New tournament</h1>
          <p className="mt-1 text-sm text-slate-400">
            Fill in the details below. You can add categories and players after creation.
          </p>
        </div>

        <div className="rounded-xl bg-surface-card p-8 ring-1 ring-surface-border">
          <TournamentForm clubs={clubs} defaultClubId={defaultClubId} />
        </div>
      </main>
    </div>
  );
}
