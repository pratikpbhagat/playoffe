import { redirect, notFound } from 'next/navigation';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { withdrawEntryAction } from '@/lib/actions/registration';
import { AppNav } from '@/components/layout/AppNav';
import Link from 'next/link';

interface Props {
  params: Promise<{ id: string; catId: string }>;
}

export default async function WithdrawPage({ params }: Props) {
  const { id: tournamentSlug, catId: catSlug } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?return=/events/${tournamentSlug}`);

  const admin = createAdminClient();

  // Look up tournament by slug
  const { data: tournament } = await admin
    .from('tournaments')
    .select('id')
    .eq('slug', tournamentSlug)
    .single();

  if (!tournament) notFound();

  // Look up category by slug + tournament_id
  const { data: category } = await admin
    .from('tournament_categories')
    .select('id')
    .eq('slug', catSlug)
    .eq('tournament_id', tournament.id)
    .single();

  if (!category) notFound();

  // Find the player's entry for this category
  const { data: entry } = await admin
    .from('tournament_entries')
    .select('id, status, tournament_categories!category_id(name), tournaments!tournament_id(name)')
    .eq('category_id', category.id)
    .eq('player_id', user.id)
    .not('status', 'eq', 'withdrawn')
    .maybeSingle();

  if (!entry) notFound();

  const catName = (entry.tournament_categories as { name: string } | null)?.name ?? 'Category';
  const tName = (entry.tournaments as { name: string } | null)?.name ?? 'Tournament';

  const STATUS_LABEL: Record<string, string> = {
    active:     'registered',
    pending:    'pending approval',
    waitlisted: 'on the waitlist',
  };

  async function doWithdraw() {
    'use server';
    const result = await withdrawEntryAction(entry!.id);
    if (!result.error) {
      redirect(`/events/${tournamentSlug}`);
    }
  }

  return (
    <div className="min-h-screen bg-surface">
      <AppNav />
      <main className="mx-auto max-w-md px-6 py-20 text-center">
        <p className="text-3xl mb-4">⚠️</p>
        <h1 className="text-xl font-bold text-white">Withdraw from {catName}?</h1>
        <p className="mt-2 text-sm text-slate-400">
          You are currently {STATUS_LABEL[entry.status] ?? 'registered'} for{' '}
          <strong className="text-white">{catName}</strong> in{' '}
          <strong className="text-white">{tName}</strong>.
        </p>
        <p className="mt-1 text-sm text-slate-500">
          You can re-register later if spots are still available.
        </p>

        <div className="mt-8 flex justify-center gap-3">
          <form action={doWithdraw}>
            <button
              type="submit"
              className="rounded-lg bg-red-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-600 transition-colors"
            >
              Yes, withdraw
            </button>
          </form>
          <Link
            href={`/events/${tournamentSlug}`}
            className="rounded-lg border border-slate-600 px-5 py-2.5 text-sm text-slate-300 hover:bg-surface-card transition-colors"
          >
            Cancel
          </Link>
        </div>
      </main>
    </div>
  );
}
