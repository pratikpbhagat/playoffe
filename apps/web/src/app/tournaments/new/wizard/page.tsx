import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, createAdminClient } from '@/lib/supabase/server';
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

  // If no club param, we need one to scope the wizard context.
  if (!clubId) {
    const clubs = await getMyClubs();
    if (clubs.length === 0) redirect('/tournaments/new');
    if (clubs.length === 1) redirect(`/tournaments/new/wizard?club=${clubs[0].id}`);
    // Multiple clubs — ask which one instead of silently defaulting to the first.
    return <ClubPicker clubs={clubs} />;
  }

  const clubs = await getMyClubs();
  const club = clubs.find((c) => c.id === clubId);
  if (!club) redirect('/tournaments/new');

  const admin = createAdminClient();
  const { data: existingTournaments } = await admin
    .from('tournaments')
    .select('name')
    .eq('club_id', clubId);
  const existingNames = (existingTournaments ?? []).map((t) => (t as { name: string }).name);

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
          existingTournamentNames={existingNames}
        />
      </div>
    </div>
  );
}

// ── Club picker (shown when the manager belongs to 2+ clubs and none was specified) ──────

interface PickerClub {
  id: string;
  name: string;
  brand_primary_color?: string | null;
  city?: string | null;
  location?: string | null;
}

function ClubPicker({ clubs }: { clubs: PickerClub[] }) {
  return (
    <div className="min-h-screen bg-surface">
      <AppNav />

      <main className="mx-auto max-w-2xl px-6 py-10">
        <div className="mb-6 flex items-center gap-3">
          <Link
            href="/tournaments/new"
            className="text-sm text-slate-500 hover:text-slate-300 transition-colors"
          >
            ← Back
          </Link>
        </div>

        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">Which club is this for?</h1>
          <p className="mt-1 text-sm text-slate-400">
            You manage {clubs.length} clubs — pick one to start the AI wizard.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {clubs.map((club) => (
            <Link
              key={club.id}
              href={`/tournaments/new/wizard?club=${club.id}`}
              className="group flex items-center gap-4 rounded-xl bg-surface-card px-5 py-4 ring-1 ring-surface-border hover:ring-brand-500/40 transition-all"
            >
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-xl font-black text-white shadow-sm"
                style={{ backgroundColor: club.brand_primary_color ?? '#7c3aed' }}
              >
                {club.name[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white group-hover:text-brand-300 transition-colors truncate">
                  {club.name}
                </p>
                {(club.city || club.location) && (
                  <p className="mt-0.5 text-xs text-slate-500 truncate">
                    📍 {[club.city, club.location].filter(Boolean).join(', ')}
                  </p>
                )}
              </div>
              <span className="shrink-0 text-slate-600 group-hover:text-brand-400 transition-colors text-sm">
                →
              </span>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
