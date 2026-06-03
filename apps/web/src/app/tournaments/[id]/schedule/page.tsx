import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { createClient, createAdminClient, getUserRoles } from '@/lib/supabase/server';
import { AppNav } from '@/components/layout/AppNav';
import { ScheduleEditor } from '@/components/tournaments/ScheduleEditor';
import { ShareScheduleButton } from '@/components/tournaments/ShareScheduleButton';
import type { MatchForScheduling } from '@/components/tournaments/ScheduleEditor';
import { isFeatureEnabled } from '@/lib/features';

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
    .select('id, name, slug, club_id, start_date')
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

  // Fetch all matches — include partner joins for doubles categories
  const { data: raw } = await admin
    .from('matches')
    .select(`
      id, status, court, scheduled_time, round, round_name, group_name, category_id,
      ea:tournament_entries!entry_a_id(
        players!player_id(full_name),
        partner:players!partner_id(full_name)
      ),
      eb:tournament_entries!entry_b_id(
        players!player_id(full_name),
        partner:players!partner_id(full_name)
      ),
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
    ea: { players: { full_name: string } | null; partner: { full_name: string } | null } | null;
    eb: { players: { full_name: string } | null; partner: { full_name: string } | null } | null;
    tc: { name: string } | null;
  };

  function buildName(
    entry: { players: { full_name: string } | null; partner: { full_name: string } | null } | null,
  ): string {
    const main = entry?.players?.full_name;
    const partner = entry?.partner?.full_name;
    if (!main) return 'TBD';
    return partner ? `${main} / ${partner}` : main;
  }

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
    player_a: buildName(m.ea),
    player_b: buildName(m.eb),
  }));

  const scheduledCount = matches.filter((m) => m.scheduled_time).length;
  const totalCount     = matches.filter((m) => m.status === 'scheduled').length;

  // Show "Share schedule on social" button only when the organiser flag is enabled
  // and the club has at least one active social connection.
  const organiserSocialEnabled = await isFeatureEnabled('social_media_organiser');
  let canShareSchedule = false;
  if (organiserSocialEnabled && scheduledCount > 0) {
    const { data: clubConns } = await admin
      .from('club_social_connections' as any)
      .select('id')
      .eq('club_id', t.club_id)
      .eq('is_active', true)
      .limit(1);
    canShareSchedule = (clubConns as any[] | null)?.length ? (clubConns as any[]).length > 0 : false;
  }

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

          <div className="flex items-center gap-2 shrink-0">
            {canShareSchedule && (
              <ShareScheduleButton
                tournamentId={t.id}
                matchCount={scheduledCount}
              />
            )}
            <Link
              href={`/tournaments/${slug}/scoring`}
              className="rounded-lg border border-surface-border px-3 py-1.5 text-xs text-slate-400 hover:text-white hover:border-slate-500 transition-colors"
            >
              Go to scoring →
            </Link>
          </div>
        </div>

        <ScheduleEditor
          tournamentSlug={slug}
          startDate={t.start_date ?? new Date().toISOString().slice(0, 10)}
          matches={matches}
        />
      </main>
    </div>
  );
}
