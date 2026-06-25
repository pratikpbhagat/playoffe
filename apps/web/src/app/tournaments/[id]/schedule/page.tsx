import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { createAdminClient, createClient, getCurrentUser, getUserRoles } from '@/lib/supabase/server';
import { AppNav } from '@/components/layout/AppNav';
import { ScheduleEditor } from '@/components/tournaments/ScheduleEditor';
import { CategoryScheduleOrder } from '@/components/tournaments/CategoryScheduleOrder';
import { ShareScheduleButton } from '@/components/tournaments/ShareScheduleButton';
import type { MatchForScheduling } from '@/components/tournaments/ScheduleEditor';
import { isFeatureEnabled } from '@/lib/features';
import { isSuperAdmin } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Schedule matches' };

interface Props {
  params: Promise<{ id: string }>;
}

export default async function SchedulePage({ params }: Props) {
  const { id: slug } = await params;

  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();

  // Tournament + auth check — include scheduling params
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: t } = await (admin.from('tournaments') as any)
    .select('id, name, slug, club_id, start_date, end_date, court_count, default_match_duration_mins, default_changeover_mins, default_start_time, scoring_format, num_sets')
    .eq('slug', slug)
    .single() as { data: Record<string, unknown> | null };
  if (!t) notFound();

  // Extract typed fields from the any-cast result
  const tData = t as {
    id: string; name: string; slug: string; club_id: string; start_date: string | null; end_date: string | null;
    court_count: number;
    default_match_duration_mins: number;
    default_changeover_mins: number;
    default_start_time: string;
    scoring_format: string | null;
    num_sets: number | null;
  };

  const { data: mgr } = await admin
    .from('club_managers')
    .select('role')
    .eq('club_id', tData.club_id)
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

  // Fetch all matches — include partner joins for doubles categories.
  // Knockout matches whose participants aren't decided yet (group stage still
  // in progress, or an earlier knockout round unresolved) are deliberately
  // NOT filtered out here — they're shown as placeholder rows below so
  // organisers can assign court/time ahead of the results being known.
  const { data: raw } = await admin
    .from('matches')
    .select(`
      id, status, court, scheduled_time, round, round_name, group_name, category_id, bracket_position,
      ea:tournament_entries!entry_a_id(
        players!player_id(full_name),
        partner:players!partner_id(full_name)
      ),
      eb:tournament_entries!entry_b_id(
        players!player_id(full_name),
        partner:players!partner_id(full_name)
      ),
      tc:tournament_categories!category_id(name, draw_format, groups_count, advance_per_group, scoring_override, scoring_format, num_sets, schedule_day, schedule_order)
    `)
    .eq('tournament_id', tData.id)
    .eq('status', 'scheduled')
    .order('scheduled_time', { ascending: true, nullsFirst: true })
    .order('round', { ascending: true });

  type RawEntry = { players: { full_name: string } | null; partner: { full_name: string } | null } | null;
  type RawMatch = {
    id: string;
    status: string;
    court: number | null;
    scheduled_time: string | null;
    round: number;
    round_name: string | null;
    group_name: string | null;
    category_id: string;
    bracket_position: number | null;
    ea: RawEntry;
    eb: RawEntry;
    tc: {
      name: string; draw_format: string | null; groups_count: number | null; advance_per_group: number | null;
      scoring_override: boolean | null; scoring_format: string | null; num_sets: number | null;
      schedule_day: string | null; schedule_order: number | null;
    } | null;
  };

  const allRaw = (raw ?? []) as unknown as RawMatch[];

  // ── Placeholder labels for knockout matches with undecided participants ────
  function ordinal(n: number): string {
    const v = n % 100;
    const suffix = (v >= 11 && v <= 13) ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
    return `${n}${suffix}`;
  }

  // Mirrors the cross-group pairing in `promoteGroupWinnersAction` (draws.ts) —
  // a team should never face its own group again, so groups are paired up
  // (A/B, C/D, …) and rank r from one group plays rank (topPerGroup + 1 - r)
  // from the other, symmetrically. This produces the same symbolic order
  // ("1st Group A", "2nd Group B", …) the real promotion will later fill in,
  // so Round 1 knockout slots can be labelled before group results exist.
  function buildSymbolicAdvancers(groupsCount: number, topPerGroup: number): string[] {
    const groupNames = Array.from({ length: groupsCount }, (_, i) => `Group ${String.fromCharCode(65 + i)}`);
    const label = (g: string, r: number) => `${ordinal(r)} ${g}`;
    const advancers: string[] = [];
    for (let i = 0; i + 1 < groupsCount; i += 2) {
      const gi = groupNames[i];
      const gj = groupNames[i + 1];
      for (let r = 1; r <= Math.floor(topPerGroup / 2); r++) {
        const rOpp = topPerGroup + 1 - r;
        advancers.push(label(gi, r), label(gj, rOpp));
        advancers.push(label(gj, r), label(gi, rOpp));
      }
      if (topPerGroup % 2 === 1) {
        const mid = (topPerGroup + 1) / 2;
        advancers.push(label(gi, mid), label(gj, mid));
      }
    }
    return advancers;
  }

  // round_name per (category, round) for knockout-only rounds — used to label
  // later rounds as "Winner of <previous round> Match <n>".
  const roundNameByCategoryRound = new Map<string, string>();
  for (const m of allRaw) {
    if (m.group_name === null) {
      roundNameByCategoryRound.set(`${m.category_id}:${m.round}`, (m.round_name ?? `Round ${m.round}`).replace(/^Knockout - /, ''));
    }
  }

  // Symbolic "1st Group A vs 2nd Group B" labels for the first knockout round
  // of each group_stage_knockout category.
  const round1LabelByMatchId = new Map<string, { a: string; b: string }>();
  const categoriesSeen = new Set<string>();
  for (const m of allRaw) {
    if (m.group_name !== null || categoriesSeen.has(m.category_id)) continue;
    categoriesSeen.add(m.category_id);
    if (m.tc?.draw_format !== 'group_stage_knockout') continue;

    // `groups_count` on the category is often unset (only persisted when an
    // explicit override was passed at draw-generation time) — the distinct
    // group_name values actually present on this category's matches are the
    // reliable source of truth for how many groups exist.
    const groupsCount = new Set(
      allRaw.filter((x) => x.category_id === m.category_id && x.group_name !== null).map((x) => x.group_name as string),
    ).size;
    if (groupsCount === 0) continue;

    const catKnockout = allRaw.filter((x) => x.category_id === m.category_id && x.group_name === null);
    const minRound = Math.min(...catKnockout.map((x) => x.round));
    const round1 = catKnockout
      .filter((x) => x.round === minRound)
      .sort((a, b) => (a.bracket_position ?? 0) - (b.bracket_position ?? 0));

    const advancers = buildSymbolicAdvancers(groupsCount, m.tc?.advance_per_group ?? 2);
    let idx = 0;
    for (const match of round1) {
      const a = advancers[idx++];
      const b = advancers[idx++];
      if (a || b) round1LabelByMatchId.set(match.id, { a: a ?? 'TBD', b: b ?? 'TBD' });
    }
  }

  function placeholderLabel(m: RawMatch, slot: 'a' | 'b'): string {
    if (m.group_name !== null) return 'TBD';

    const r1 = round1LabelByMatchId.get(m.id);
    if (r1) return slot === 'a' ? r1.a : r1.b;

    if (m.bracket_position == null) return 'TBD';
    const prevRoundName = roundNameByCategoryRound.get(`${m.category_id}:${m.round - 1}`);
    if (!prevRoundName) return 'TBD';
    const prevPos = slot === 'a' ? m.bracket_position * 2 : m.bracket_position * 2 + 1;
    return `Winner of ${prevRoundName} Match ${prevPos + 1}`;
  }

  function buildName(entry: RawEntry, m: RawMatch, slot: 'a' | 'b'): string {
    const main = entry?.players?.full_name;
    const partner = entry?.partner?.full_name;
    if (!main) return placeholderLabel(m, slot);
    return partner ? `${main} / ${partner}` : main;
  }

  const matches: MatchForScheduling[] = allRaw.map((m) => ({
    id: m.id,
    status: m.status,
    court: m.court,
    scheduled_time: m.scheduled_time,
    round: m.round,
    round_name: m.round_name,
    group_name: m.group_name,
    category_id: m.category_id,
    category_name: m.tc?.name ?? 'Unknown category',
    player_a: buildName(m.ea, m, 'a'),
    player_b: buildName(m.eb, m, 'b'),
    player_a_is_placeholder: !m.ea?.players?.full_name,
    player_b_is_placeholder: !m.eb?.players?.full_name,
  }));

  const scheduledCount = matches.filter((m) => m.scheduled_time).length;
  const totalCount     = matches.filter((m) => m.status === 'scheduled').length;

  // ── Tournament days (for the day/order drag-and-drop UI) ──────────────────
  // Built with pure UTC date math — parsing a "YYYY-MM-DD" string via
  // `new Date(...)` interprets it in the server's local timezone, which can
  // silently roll the date back/forward a day once converted back to a
  // string (e.g. in any UTC+ timezone). Date.UTC() sidesteps that entirely.
  const startDateStr = tData.start_date ?? new Date().toISOString().slice(0, 10);
  const endDateStr = tData.end_date ?? startDateStr;
  const tournamentDays: string[] = [];
  {
    const [sy, sm, sd] = startDateStr.split('-').map(Number);
    const [ey, em, ed] = endDateStr.split('-').map(Number);
    let cursor = Date.UTC(sy, sm - 1, sd);
    const last = Date.UTC(ey, em - 1, ed);
    while (cursor <= last) {
      tournamentDays.push(new Date(cursor).toISOString().slice(0, 10));
      cursor += 24 * 60 * 60_000;
    }
  }

  // ── Category list for the day/order drag-and-drop UI ───────────────────────
  // A category's stored schedule_day can end up outside the tournament's
  // actual date range (e.g. the tournament's dates were edited afterwards, or
  // it was saved before a since-fixed timezone bug) — fall back to the first
  // tournament day rather than letting the category silently disappear from
  // every rendered day column.
  const categorySeen = new Map<string, { id: string; name: string; day: string; order: number; matchCount: number }>();
  for (const m of allRaw) {
    if (!categorySeen.has(m.category_id)) {
      const storedDay = m.tc?.schedule_day;
      const day = storedDay && tournamentDays.includes(storedDay) ? storedDay : startDateStr;
      categorySeen.set(m.category_id, {
        id: m.category_id,
        name: m.tc?.name ?? 'Unknown category',
        day,
        order: m.tc?.schedule_order ?? 0,
        matchCount: 0,
      });
    }
    categorySeen.get(m.category_id)!.matchCount++;
  }
  const scheduleCategories = [...categorySeen.values()].sort((a, b) => a.order - b.order);

  // Derive default match duration from tournament scoring format (rally vs traditional)
  const scoringFormat  = (tData.scoring_format ?? 'rally') as 'rally' | 'traditional';
  const numSets        = (tData.num_sets ?? 1) as number;
  const perSet         = scoringFormat === 'rally' ? 10 : 20;
  const changeoverMins = (tData.default_changeover_mins ?? 5);
  // User-stored override takes precedence over the built-in default of 45
  const storedDuration  = tData.default_match_duration_mins;
  const derivedDuration = numSets * perSet + Math.max(0, numSets - 1) * changeoverMins;
  const matchDurationMins = storedDuration !== 45 ? storedDuration : derivedDuration;

  // Per-category effective duration — categories can override the tournament's
  // scoring format/set count (e.g. singles best-of-3 vs. doubles best-of-1),
  // so a single tournament-wide duration isn't accurate when multiple
  // categories with different formats are being scheduled together.
  const categoryDurationMins: Record<string, number> = {};
  for (const m of allRaw) {
    if (categoryDurationMins[m.category_id] !== undefined) continue;
    const tc = m.tc;
    const catScoringFormat = ((tc?.scoring_override ? tc?.scoring_format : null) ?? scoringFormat) as 'rally' | 'traditional';
    const catNumSets = (tc?.scoring_override ? tc?.num_sets : null) ?? numSets;
    categoryDurationMins[m.category_id] =
      catNumSets * (catScoringFormat === 'rally' ? 10 : 20) + Math.max(0, catNumSets - 1) * changeoverMins;
  }

  const defaultStartTime = tData.default_start_time
    ? String(tData.default_start_time).slice(0, 5)
    : '09:00';

  const courtCount    = (tData.court_count ?? 2);
  const aiConfigured  = !!process.env.ANTHROPIC_API_KEY;

  // AI assistant visibility:
  // - Super admins always see it (bypass flag)
  // - Other admins see it only when the ai_schedule_assistant flag is enabled
  const userIsSuperAdmin = isSuperAdmin(user);
  const aiAssistantFlagEnabled = await isFeatureEnabled('ai_schedule_assistant');
  const aiEnabled = userIsSuperAdmin || aiAssistantFlagEnabled;

  // Show "Share schedule on social" button only when the organiser flag is enabled
  // and the club has at least one active social connection.
  const organiserSocialEnabled = await isFeatureEnabled('social_media_organiser');
  let canShareSchedule = false;
  if (organiserSocialEnabled && scheduledCount > 0) {
    const { data: clubConns } = await admin
      .from('club_social_connections' as any)
      .select('id')
      .eq('club_id', tData.club_id)
      .eq('is_active', true)
      .limit(1);
    canShareSchedule = (clubConns as any[] | null)?.length ? (clubConns as any[]).length > 0 : false;
  }

  return (
    <div className="min-h-screen bg-surface">
      <AppNav />

      <main className="mx-auto max-w-4xl px-6 py-10">
        {/* Breadcrumb */}
        <nav className="mb-6 flex items-center gap-2 text-xs text-slate-500 sm:text-sm">
          <Link href={`/tournaments/${slug}`} className="hover:text-slate-300 transition-colors">
            {tData.name}
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
                tournamentId={tData.id}
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

        {scheduleCategories.length > 1 && (
          <CategoryScheduleOrder
            tournamentSlug={slug}
            days={tournamentDays}
            initialCategories={scheduleCategories}
          />
        )}

        <ScheduleEditor
          tournamentSlug={slug}
          startDate={tData.start_date ?? new Date().toISOString().slice(0, 10)}
          courtCount={courtCount}
          matchDurationMins={matchDurationMins}
          categoryDurationMins={categoryDurationMins}
          changeoverMins={changeoverMins}
          defaultStartTime={defaultStartTime}
          matches={matches}
          aiEnabled={aiEnabled}
          aiConfigured={aiConfigured}
        />
      </main>
    </div>
  );
}
