import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { createClient, createAdminClient, getUserRoles } from '@/lib/supabase/server';
import { AppNav } from '@/components/layout/AppNav';
import { CopyLinkButton } from '@/components/ui/CopyLinkButton';
import { FinalizeCategoryButton } from '@/components/tournaments/FinalizeCategoryButton';

export const metadata: Metadata = { title: 'Tournament Results' };

interface Props {
  params: Promise<{ id: string }>;
}

const PODIUM = [
  { key: 'winner_entry_id',      emoji: '🥇', label: 'Champion',   color: '#fbbf24' },
  { key: 'runner_up_entry_id',   emoji: '🥈', label: 'Runner-up',  color: '#94a3b8' },
  { key: 'third_place_entry_id', emoji: '🥉', label: '3rd Place',  color: '#cd7c2e' },
] as const;

export default async function TournamentResultsPage({ params }: Props) {
  const { id: slug } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();

  const { data: t } = await admin
    .from('tournaments')
    .select('id, name, club_id, start_date, end_date, venue, status, clubs(name, logo_url)')
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

  const { data: categories } = await admin
    .from('tournament_categories')
    .select('id, name, play_format, draw_format, status, winner_entry_id, runner_up_entry_id, third_place_entry_id')
    .eq('tournament_id', t.id)
    .order('name');

  // Collect all entry IDs we need to resolve to names
  const entryIds = new Set<string>();
  for (const cat of categories ?? []) {
    if (cat.winner_entry_id)      entryIds.add(cat.winner_entry_id);
    if (cat.runner_up_entry_id)   entryIds.add(cat.runner_up_entry_id);
    if (cat.third_place_entry_id) entryIds.add(cat.third_place_entry_id);
  }

  const entryNames = new Map<string, string>();
  if (entryIds.size > 0) {
    const { data: entries } = await admin
      .from('tournament_entries')
      .select('id, player_id, partner_id, players!player_id(full_name)')
      .in('id', [...entryIds]);

    const partnerIds = (entries ?? []).map((e) => e.partner_id).filter((x): x is string => x != null);
    const partnerMap = new Map<string, string>();
    if (partnerIds.length > 0) {
      const { data: partners } = await admin
        .from('players')
        .select('id, full_name')
        .in('id', partnerIds);
      for (const p of partners ?? []) partnerMap.set(p.id, p.full_name);
    }

    for (const e of entries ?? []) {
      const pn = (e.players as { full_name: string } | null)?.full_name ?? 'Unknown';
      const partner = e.partner_id ? partnerMap.get(e.partner_id) : null;
      entryNames.set(e.id, partner ? `${pn} / ${partner}` : pn);
    }
  }

  // Match stats (include category_id for per-category completion check)
  const { data: matchStats } = await admin
    .from('matches')
    .select('status, category_id')
    .eq('tournament_id', t.id)
    .not('entry_a_id', 'is', null)
    .not('entry_b_id', 'is', null);

  const totalMatches    = matchStats?.length ?? 0;
  const completedMatches = matchStats?.filter((m) => m.status === 'completed' || m.status === 'walkover').length ?? 0;
  const cats = categories ?? [];
  const completedCats   = cats.filter((c) => c.status === 'completed').length;

  // Per-category: are all matches done?
  const pendingByCat: Record<string, number> = {};
  for (const m of matchStats ?? []) {
    if (!pendingByCat[m.category_id]) pendingByCat[m.category_id] = 0;
    if (m.status === 'scheduled' || m.status === 'in_progress') {
      pendingByCat[m.category_id]++;
    }
  }

  const club = t.clubs as { name: string; logo_url: string | null } | null;
  const shareUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/events/${slug}`;

  return (
    <div className="min-h-screen bg-surface">
      <AppNav />

      <main className="mx-auto max-w-4xl px-6 py-10">
        {/* Breadcrumb */}
        <nav className="mb-6 flex items-center gap-2 text-xs text-slate-500 sm:text-sm">
          <Link href={`/tournaments/${slug}`} className="hover:text-slate-300 transition-colors">
            {t.name}
          </Link>
          <span>/</span>
          <span className="text-slate-400">Results</span>
        </nav>

        {/* Header */}
        <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">{t.name}</h1>
            <p className="mt-1 text-sm text-slate-400">
              {club?.name}
              {t.venue ? ` · ${t.venue}` : ''}
              {t.start_date
                ? ` · ${new Date(t.start_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`
                : ''}
            </p>
          </div>
          <div className="shrink-0">
            <CopyLinkButton url={shareUrl} label="Share results" />
          </div>
        </div>

        {/* Stats strip */}
        <div className="mb-8 grid grid-cols-3 gap-3 sm:gap-4">
          {[
            { label: 'Categories', value: cats.length },
            { label: 'Matches played', value: completedMatches },
            { label: 'Categories finished', value: `${completedCats}/${cats.length}` },
          ].map((s) => (
            <div key={s.label} className="rounded-xl bg-surface-card p-3 ring-1 ring-surface-border text-center sm:p-5">
              <p className="text-xl font-bold text-white sm:text-2xl">{s.value}</p>
              <p className="mt-1 text-[10px] text-slate-500 sm:text-xs">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Category podiums */}
        {cats.length === 0 ? (
          <div className="rounded-xl bg-surface-card p-12 text-center ring-1 ring-surface-border">
            <p className="text-slate-500">No categories found.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {cats.map((cat) => {
              const hasResults = cat.winner_entry_id || cat.runner_up_entry_id || cat.third_place_entry_id;
              return (
                <div key={cat.id} className="rounded-xl bg-surface-card ring-1 ring-surface-border overflow-hidden">
                  {/* Category header */}
                  <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border gap-4 flex-wrap">
                    <div>
                      <h2 className="font-semibold text-white">{cat.name}</h2>
                      <p className="text-xs text-slate-500 mt-0.5 capitalize">
                        {cat.play_format.replace('_', ' ')} · {cat.draw_format.replace(/_/g, ' ')}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        cat.status === 'completed'
                          ? 'bg-accent-500/10 text-accent-400 ring-1 ring-accent-500/20'
                          : 'bg-slate-700/50 text-slate-400'
                      }`}>
                        {cat.status === 'completed' ? 'Completed' : 'In progress'}
                      </span>
                    </div>
                  </div>

                  {hasResults ? (
                    <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-surface-border">
                      {PODIUM.map((pos) => {
                        const entryId = cat[pos.key];
                        if (!entryId) return (
                          <div key={pos.key} className="px-6 py-5 text-center">
                            <p className="text-2xl mb-1">{pos.emoji}</p>
                            <p className="text-xs text-slate-600">{pos.label}</p>
                            <p className="text-sm text-slate-600 mt-1">—</p>
                          </div>
                        );
                        return (
                          <div key={pos.key} className="px-6 py-5 text-center">
                            <p className="text-2xl mb-1">{pos.emoji}</p>
                            <p className="text-xs text-slate-500 mb-1">{pos.label}</p>
                            <p className="font-semibold text-sm" style={{ color: pos.color }}>
                              {entryNames.get(entryId) ?? '—'}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  ) : (pendingByCat[cat.id] ?? 0) === 0 ? (
                    <FinalizeCategoryButton
                      categoryId={cat.id}
                      categoryName={cat.name}
                      hasResults={!!cat.winner_entry_id}
                    />
                  ) : (
                    <div className="px-6 py-8 text-center">
                      <p className="text-sm text-slate-600">No results recorded yet</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Footer actions */}
        <div className="mt-10 flex flex-wrap items-center gap-3 sm:gap-4">
          <Link
            href={`/tournaments/${slug}`}
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-surface-card transition-colors"
          >
            ← Back to tournament
          </Link>
          <Link
            href={`/tournaments/${slug}/scoring`}
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-surface-card transition-colors"
          >
            Go to scoring
          </Link>
        </div>
      </main>
    </div>
  );
}
