import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { createClient, createAdminClient, getUserRoles } from '@/lib/supabase/server';
import { AppNav } from '@/components/layout/AppNav';
import { ScheduleEditor } from '@/components/tournaments/ScheduleEditor';
import type { MatchForScheduling } from '@/components/tournaments/ScheduleEditor';

export const metadata: Metadata = { title: 'Schedule matches' };

interface Props {
  params: Promise<{ id: string }>;
}

export default async function SchedulePage({ params }: Props) {
  const { id: slug } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();

  // Tournament + auth check
  const { data: t } = await admin
    .from('tournaments')
    .select('id, name, slug, club_id, start_date, court_count')
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

  // Fetch all matches that have both players (excludes TBD bracket slots)
  const { data: raw } = await admin
    .from('matches')
    .select(`
      id, status, court, scheduled_time, round, round_name, group_name, category_id,
      ea:tournament_entries!entry_a_id(players!player_id(full_name)),
      eb:tournament_entries!entry_b_id(players!player_id(full_name)),
      tc:tournament_categories!category_id(name)
    `)
    .eq('tournament_id', t.id)
    .not('entry_a_id', 'is', null)
    .not('entry_b_id', 'is', null)
    .order('scheduled_time', { ascending: true, nullsFirst: true })
    .order('round', { ascending: true });

  type RawMatch = {
    id: string;
    status: string;
    court: number | null;
    scheduled_time: string | null;
    round: number;
    round_name: string | null;
    group_name: string | null;
    category_id: string;
    ea: { players: { full_name: string } | null } | null;
    eb: { players: { full_name: string } | null } | null;
    tc: { name: string } | null;
  };

  const matches: MatchForScheduling[] = ((raw ?? []) as unknown as RawMatch[]).map((m) => ({
    id: m.id,
    status: m.status,
    court: m.court,
    scheduled_time: m.scheduled_time,
    round: m.round,
    round_name: m.round_name,
    group_name: m.group_name,
    category_id: m.category_id,
    category_name: m.tc?.name ?? 'Unknown category',
    player_a: m.ea?.players?.full_name ?? 'TBD',
    player_b: m.eb?.players?.full_name ?? 'TBD',
  }));

  const scheduledCount = matches.filter((m) => m.scheduled_time).length;
  const totalCount = matches.filter((m) => m.status === 'scheduled').length;

  return (
    <div className="min-h-screen bg-surface">
      <AppNav />

      <main className="mx-auto max-w-4xl px-6 py-10">
        {/* Breadcrumb */}
        <nav className="mb-6 flex items-center gap-2 text-sm text-slate-500">
          <Link href={`/tournaments/${slug}`} className="hover:text-slate-300 transition-colors">
            {t.name}
          </Link>
          <span>/</span>
          <span className="text-slate-400">Schedule</span>
        </nav>

        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Match schedule</h1>
            <p className="mt-1 text-sm text-slate-500">
              {totalCount > 0
                ? `${scheduledCount} of ${totalCount} upcoming match${totalCount !== 1 ? 'es' : ''} scheduled`
                : 'No upcoming matches — generate a draw first'}
            </p>
          </div>

          <Link
            href={`/tournaments/${slug}/scoring`}
            className="shrink-0 rounded-lg border border-surface-border px-3 py-1.5 text-xs text-slate-400 hover:text-white hover:border-slate-500 transition-colors"
          >
            Go to scoring →
          </Link>
        </div>

        <ScheduleEditor
          tournamentSlug={slug}
          courtCount={t.court_count ?? 1}
          startDate={t.start_date}
          matches={matches}
        />
      </main>
    </div>
  );
}
