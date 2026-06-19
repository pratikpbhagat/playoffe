import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/supabase/server';
import { AppNav } from '@/components/layout/AppNav';
import { WizardChat } from '@/components/tournaments/WizardChat';
import { getMyClubs } from '@/lib/actions/clubs';

export const metadata: Metadata = { title: 'New tournament — AI Wizard' };

interface Props {
  searchParams: Promise<{ club?: string }>;
}

export default async function WizardPage({ searchParams }: Props) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const { club: clubId } = await searchParams;

  // If no club param, we need one to scope the wizard context
  if (!clubId) {
    const clubs = await getMyClubs();
    if (clubs.length === 0) redirect('/tournaments/new');
    if (clubs.length === 1) redirect(`/tournaments/new/wizard?club=${clubs[0].id}`);
    // Multiple clubs — redirect to the standard page to pick one first
    redirect('/tournaments/new');
  }

  const clubs = await getMyClubs();
  const club = clubs.find((c) => c.id === clubId);
  if (!club) redirect('/tournaments/new');

  return (
    <div className="h-screen bg-surface flex flex-col overflow-hidden">
      <AppNav />

      {/* Page header */}
      <div className="shrink-0 border-b border-surface-border px-6 py-3">
        <div className="mx-auto max-w-5xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/tournaments/new"
              className="text-sm text-slate-500 hover:text-slate-300 transition-colors"
            >
              ← Back
            </Link>
            <span className="text-slate-700">|</span>
            <span className="text-sm font-semibold text-white">AI Tournament Wizard</span>
            <span className="rounded-full bg-brand-900/50 px-2 py-0.5 text-[10px] font-bold text-brand-300">
              Claude
            </span>
          </div>
          <span className="text-xs text-slate-500">{club.name}</span>
        </div>
      </div>

      {/* Wizard — fills remaining height */}
      <div className="flex-1 min-h-0 mx-auto w-full max-w-5xl">
        <WizardChat
          clubId={clubId}
          clubName={typeof club.name === 'string' ? club.name : 'your club'}
        />
      </div>
    </div>
  );
}
