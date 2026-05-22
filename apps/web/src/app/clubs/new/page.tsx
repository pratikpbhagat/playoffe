import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppNav } from '@/components/layout/AppNav';
import { ClubForm } from '@/components/clubs/ClubForm';

export const metadata: Metadata = { title: 'Create a club' };

export default async function NewClubPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return (
    <div className="min-h-screen bg-surface">
      <AppNav />

      <main className="mx-auto max-w-2xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">Create a club</h1>
          <p className="mt-1 text-sm text-slate-400">
            Clubs are the home for your tournaments, teams, and players.
          </p>
        </div>

        <div className="rounded-xl bg-surface-card p-8 ring-1 ring-surface-border">
          <ClubForm />
        </div>
      </main>
    </div>
  );
}
