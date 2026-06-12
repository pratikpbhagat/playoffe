import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { AppNav } from '@/components/layout/AppNav';
import { KnockoutBuilder } from '@/components/tournaments/KnockoutBuilder';
import { getKnockoutBuilderStateAction } from '@/lib/actions/draws';

export const metadata: Metadata = { title: 'Knockout builder' };

interface Props {
  params: Promise<{ id: string; catId: string }>;
}

export default async function KnockoutBuilderPage({ params }: Props) {
  const { id: tournamentSlug, catId: catSlug } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();

  const { data: tournament } = await admin
    .from('tournaments')
    .select('id, name, club_id')
    .eq('slug', tournamentSlug)
    .single();
  if (!tournament) notFound();

  const { data: mgr } = await admin
    .from('club_managers')
    .select('role')
    .eq('club_id', tournament.club_id)
    .eq('player_id', user.id)
    .maybeSingle();
  if (!mgr) notFound();

  const { data: category } = await admin
    .from('tournament_categories')
    .select('id, name, slug, draw_format, knockout_seeding')
    .eq('slug', catSlug)
    .eq('tournament_id', tournament.id)
    .single();
  if (!category) notFound();

  const catAny = category as typeof category & { knockout_seeding?: string; draw_format?: string };
  if (catAny.draw_format !== 'group_stage_knockout' || catAny.knockout_seeding !== 'manual') {
    notFound();
  }

  const result = await getKnockoutBuilderStateAction(category.id);

  return (
    <div className="min-h-screen bg-surface-base">
      <AppNav />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-6">
          <Link
            href={`/tournaments/${tournamentSlug}/categories/${catSlug}`}
            className="text-sm text-brand-400 hover:underline"
          >
            ← Back to {category.name}
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-text-primary">Knockout Builder</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Manually create the knockout matches based on group standings and results.
          </p>
        </div>

        {'error' in result ? (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {result.error}
          </div>
        ) : (
          <KnockoutBuilder categoryId={category.id} initialState={result.data} />
        )}
      </main>
    </div>
  );
}
