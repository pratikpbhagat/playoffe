import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/supabase/server';
import { AppNav } from '@/components/layout/AppNav';
import { TournamentForm } from '@/components/tournaments/TournamentForm';
import { getMyClubs } from '@/lib/actions/clubs';

export const metadata: Metadata = { title: 'New tournament' };

interface Props {
  searchParams: Promise<{ club?: string }>;
}

export default async function NewTournamentPage({ searchParams }: Props) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const { club: defaultClubId } = await searchParams;
  const clubs = await getMyClubs();

  // Only pre-pick a club when there's no real choice to make (explicit param, or exactly
  // one club). Otherwise leave the club param off — the wizard page itself will show a
  // club picker for managers of 2+ clubs instead of silently guessing one.
  const wizardClubId = defaultClubId ?? (clubs.length === 1 ? clubs[0].id : undefined);
  const wizardHref = wizardClubId
    ? `/tournaments/new/wizard?club=${wizardClubId}`
    : '/tournaments/new/wizard';

  return (
    <div className="min-h-screen bg-surface">
      <AppNav />

      <main className="mx-auto max-w-2xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">New tournament</h1>
          <p className="mt-1 text-sm text-slate-400">
            Fill in the details below, or let the AI wizard guide you through it.
          </p>
        </div>

        {/* AI Wizard CTA */}
        <Link
          href={wizardHref}
          className="mb-6 flex items-center gap-4 rounded-xl bg-brand-950/60 px-5 py-4 ring-1 ring-brand-700/50 hover:ring-brand-500/70 hover:bg-brand-950/80 transition-all group block"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-900/60 text-xl group-hover:bg-brand-800/60 transition-colors">
            ✦
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-white">Use AI Wizard</span>
              <span className="rounded-full bg-brand-900/80 px-2 py-0.5 text-[10px] font-bold text-brand-300">
                Claude
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-400">
              Answer a few questions and Claude sets everything up — under 2 minutes.
            </p>
          </div>
          <span className="text-slate-600 group-hover:text-slate-400 transition-colors text-sm">
            →
          </span>
        </Link>

        <div className="mb-4 flex items-center gap-3">
          <div className="flex-1 h-px bg-surface-border" />
          <span className="text-xs text-slate-600">or fill in manually</span>
          <div className="flex-1 h-px bg-surface-border" />
        </div>

        <div className="rounded-xl bg-surface-card p-8 ring-1 ring-surface-border">
          <TournamentForm clubs={clubs} defaultClubId={defaultClubId} />
        </div>
      </main>
    </div>
  );
}
