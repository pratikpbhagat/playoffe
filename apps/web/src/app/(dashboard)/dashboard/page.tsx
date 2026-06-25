import { redirect } from 'next/navigation';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { createAdminClient, createClient, getCurrentUser, getUserRoles } from '@/lib/supabase/server';
import { AppNav } from '@/components/layout/AppNav';
import { getMyTournaments } from '@/lib/actions/tournaments';
import { getMyClubs } from '@/lib/actions/clubs';
import { getMyEntries, getMyPartnerInvites } from '@/lib/actions/registration';
import { isUuid } from '@/lib/validate';
import { PartnerInvitesBanner } from '@/components/events/PartnerInvitesBanner';

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  draft:             { label: 'Draft',             className: 'bg-slate-700 text-slate-300' },
  registration_open: { label: 'Registration open', className: 'bg-blue-900/60 text-blue-300' },
  in_progress:       { label: 'In progress',       className: 'bg-accent-500/20 text-accent-400' },
  completed:         { label: 'Completed',          className: 'bg-brand-600/20 text-brand-300' },
  cancelled:         { label: 'Cancelled',          className: 'bg-red-900/40 text-red-400' },
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const { data: player } = await supabase
    .from('players')
    .select('*, global_stats(*)')
    .eq('id', user.id)
    .single();

  // ── Active mode resolution ──────────────────────────────────────────────────
  const roles    = getUserRoles(user);
  const isAdmin  = roles.includes('admin');
  const isPlayer = roles.includes('player') || roles.length === 0;
  const hasBothRoles = isAdmin && isPlayer;

  const rawMode = (await cookies()).get('active_mode')?.value;
  const activeMode: 'admin' | 'player' = hasBothRoles
    ? (rawMode === 'player' ? 'player' : 'admin')
    : isAdmin ? 'admin'
    : 'player';

  // ══════════════════════════════════════════════════════════════════════════
  // ADMIN MODE — show clubs + tournaments the user manages
  // ══════════════════════════════════════════════════════════════════════════
  if (activeMode === 'admin') {
    const [tournaments, clubs] = await Promise.all([
      getMyTournaments(5),   // show only the 5 most recent on the tile; "View all →" links to /tournaments
      getMyClubs(),
    ]);

    return (
      <div className="min-h-screen bg-surface">
        <AppNav />

        <main className="mx-auto max-w-6xl px-6 py-10">
          <h1 className="text-2xl font-bold text-white">
            Welcome back, {player?.full_name ?? 'Admin'} 🏆
          </h1>
          <p className="mt-1 text-sm text-slate-500">Your admin overview — clubs and tournaments you manage.</p>

          <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Quick actions */}
            <div className="rounded-xl bg-surface-card p-6 ring-1 ring-surface-border">
              <h2 className="text-base font-semibold text-white">Quick actions</h2>
              <div className="mt-4 space-y-3">
                <Link
                  href="/tournaments"
                  className="flex items-center gap-3 rounded-lg border border-surface-border p-3 hover:bg-surface transition-colors"
                >
                  <span className="text-xl">🏆</span>
                  <span className="text-sm font-medium text-slate-300">My tournaments</span>
                </Link>
                <Link
                  href={player ? `/p/${player.username}` : '#'}
                  className="flex items-center gap-3 rounded-lg border border-surface-border p-3 hover:bg-surface transition-colors"
                >
                  <span className="text-xl">👤</span>
                  <span className="text-sm font-medium text-slate-300">View my profile</span>
                </Link>
              </div>
            </div>

            {/* My clubs */}
            <div className="rounded-xl bg-surface-card p-6 ring-1 ring-surface-border">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-white">My clubs</h2>
              </div>
              {clubs.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500">No clubs assigned yet.</p>
              ) : (
                <ul className="mt-4 space-y-2">
                  {clubs.map((c) => (
                    <li key={c.id}>
                      <Link
                        href={`/clubs/${c.slug}`}
                        className="flex items-center gap-3 rounded-lg p-2 hover:bg-surface transition-colors"
                      >
                        <span
                          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
                          style={{ backgroundColor: c.brand_primary_color }}
                        >
                          {c.name[0]}
                        </span>
                        <span className="text-sm text-slate-300">{c.name}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* My tournaments */}
            <div className="rounded-xl bg-surface-card p-6 ring-1 ring-surface-border">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-white">My tournaments</h2>
                <div className="flex items-center gap-3">
                  <Link
                    href="/tournaments/new"
                    className="text-xs text-brand-400 hover:text-brand-300 transition-colors"
                  >
                    + New
                  </Link>
                  <Link
                    href="/tournaments"
                    className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    View all →
                  </Link>
                </div>
              </div>
              {tournaments.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500">No tournaments yet.</p>
              ) : (
                <ul className="mt-4 space-y-2">
                  {(tournaments as unknown as Array<typeof tournaments[number] & { slug: string; clubs: { id: string; name: string } | null }>).map((t) => {
                    const badge = STATUS_BADGE[t.status] ?? STATUS_BADGE.draft;
                    return (
                      <li key={t.id}>
                        <Link
                          href={`/tournaments/${t.slug}`}
                          className="flex items-center justify-between rounded-lg p-2 hover:bg-surface transition-colors"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm text-slate-300">{t.name}</p>
                            <p className="text-xs text-slate-500">
                              {t.clubs?.name && <>{t.clubs.name} · </>}
                              {new Date(t.start_date).toLocaleDateString('en-AU', {
                                day: 'numeric',
                                month: 'short',
                              })}
                            </p>
                          </div>
                          <span
                            className={`ml-2 flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}
                          >
                            {badge.label}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PLAYER MODE — stats, next match, registrations, partner invites
  // ══════════════════════════════════════════════════════════════════════════
  const [myEntries, partnerInvites] = await Promise.all([
    getMyEntries(),
    getMyPartnerInvites(),
  ]);

  // ── Next match widget ────────────────────────────────────────────────────
  const admin = createAdminClient();
  const activeEntryIds = myEntries
    .filter((e) => (e.status as string) === 'active')
    .map((e) => e.id);

  type NextMatch = {
    id: string;
    scheduled_time: string;
    court: number | null;
    round_name: string | null;
    opponentName: string;
    categoryName: string;
    tournamentName: string;
    tournamentSlug: string;
  };

  let nextMatch: NextMatch | null = null;

  if (activeEntryIds.length > 0) {
    const { data: nm } = await admin
      .from('matches')
      .select(`
        id, scheduled_time, court, round_name,
        entry_a_id, entry_b_id,
        ea:tournament_entries!entry_a_id(id, player_id, players!player_id(full_name), partner:players!partner_id(full_name)),
        eb:tournament_entries!entry_b_id(id, player_id, players!player_id(full_name), partner:players!partner_id(full_name)),
        tc:tournament_categories!category_id(name),
        t:tournaments!tournament_id(name, slug)
      `)
      // entry IDs are server-derived UUIDs (not client input), but validate
      // the shape anyway before string-interpolating into a PostgREST filter —
      // this exact pattern is easy to copy-paste into a context where the
      // IDs ARE attacker-controlled, and a non-UUID string here could break
      // out of the .or() filter syntax.
      .or(`entry_a_id.in.(${activeEntryIds.filter(isUuid).join(',')}),entry_b_id.in.(${activeEntryIds.filter(isUuid).join(',')})`)
      .eq('status', 'scheduled')
      .not('scheduled_time', 'is', null)
      .gte('scheduled_time', new Date().toISOString())
      .order('scheduled_time', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (nm) {
      type EntryRef = {
        id: string;
        player_id: string;
        players: { full_name: string } | null;
        partner: { full_name: string } | null;
      } | null;
      const ea = nm.ea as unknown as EntryRef;
      const eb = nm.eb as unknown as EntryRef;
      const tc = nm.tc as { name: string } | null;
      const t  = nm.t  as { name: string; slug: string } | null;

      const isA = activeEntryIds.includes(nm.entry_a_id ?? '');
      const opponentEntry = isA ? eb : ea;
      const opponentMain    = opponentEntry?.players?.full_name;
      const opponentPartner = opponentEntry?.partner?.full_name;
      const opponentName = opponentMain
        ? (opponentPartner ? `${opponentMain} / ${opponentPartner}` : opponentMain)
        : 'TBD';

      nextMatch = {
        id: nm.id,
        scheduled_time: nm.scheduled_time!,
        court: nm.court as number | null,
        round_name: nm.round_name as string | null,
        opponentName,
        categoryName:    tc?.name ?? '',
        tournamentName:  t?.name  ?? '',
        tournamentSlug:  t?.slug  ?? '',
      };
    }
  }

  function formatMatchTime(iso: string) {
    const d       = new Date(iso);
    const now     = new Date();
    const today   = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today.getTime() + 86400000);
    const matchDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const timeStr  = d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
    if (matchDay.getTime() === today.getTime())    return `Today at ${timeStr}`;
    if (matchDay.getTime() === tomorrow.getTime()) return `Tomorrow at ${timeStr}`;
    return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' }) + ` at ${timeStr}`;
  }

  return (
    <div className="min-h-screen bg-surface">
      <AppNav />

      <main className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="text-2xl font-bold text-white">
          Welcome back, {player?.full_name ?? 'Player'} 👋
        </h1>

        {/* Stats row */}
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Rating',   value: player?.global_stats?.current_rating?.toFixed(2) ?? '3.50' },
            { label: 'Matches',  value: player?.global_stats?.total_matches ?? 0 },
            { label: 'Wins',     value: player?.global_stats?.wins ?? 0 },
            { label: 'Win rate', value: `${(((player?.global_stats?.win_rate ?? 0) as number) * 100).toFixed(0)}%` },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl bg-surface-card p-6 ring-1 ring-surface-border">
              <p className="text-3xl font-bold text-white">{stat.value}</p>
              <p className="mt-1 text-sm text-slate-400">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Next match widget */}
        {nextMatch && (
          <div className="mt-8 rounded-xl bg-brand-900/20 ring-1 ring-brand-700/30 overflow-hidden">

            {/* ── Mobile header: stacked ── */}
            <div className="sm:hidden px-5 py-4 border-b border-brand-700/20 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-base">📅</span>
                <p className="text-xs font-semibold text-brand-300 uppercase tracking-wide">Your next match</p>
              </div>
              <p className="text-sm font-bold text-white">
                {formatMatchTime(nextMatch.scheduled_time)}
                {nextMatch.court ? <span className="ml-2 text-brand-400/70 font-normal">· Court {nextMatch.court}</span> : ''}
              </p>
              <Link
                href={`/events/${nextMatch.tournamentSlug}`}
                className="block w-full text-center rounded-lg bg-brand-600/30 px-3 py-2 text-xs font-semibold text-brand-300 hover:bg-brand-600/50 transition-colors"
              >
                View event →
              </Link>
            </div>

            {/* ── Desktop header: single row ── */}
            <div className="hidden sm:flex items-center gap-3 px-6 py-4 border-b border-brand-700/20">
              <span className="text-lg">📅</span>
              <div>
                <p className="text-xs font-semibold text-brand-300 uppercase tracking-wide">Your next match</p>
                <p className="text-sm font-bold text-white mt-0.5">
                  {formatMatchTime(nextMatch.scheduled_time)}
                  {nextMatch.court ? <span className="ml-2 text-brand-400/70 font-normal">· Court {nextMatch.court}</span> : ''}
                </p>
              </div>
              <Link
                href={`/events/${nextMatch.tournamentSlug}`}
                className="ml-auto shrink-0 rounded-lg bg-brand-600/30 px-3 py-1.5 text-xs font-semibold text-brand-300 hover:bg-brand-600/50 transition-colors"
              >
                View event →
              </Link>
            </div>

            {/* ── Details row: 2-col grid on mobile, flex wrap on desktop ── */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 px-5 py-4 sm:flex sm:flex-wrap sm:items-center sm:gap-x-6 sm:gap-y-1 sm:px-6">
              <div>
                <p className="text-xs text-slate-500">vs</p>
                <p className="text-base font-semibold text-white">{nextMatch.opponentName}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Category</p>
                <p className="text-sm text-slate-300">{nextMatch.categoryName}</p>
              </div>
              {nextMatch.round_name && (
                <div>
                  <p className="text-xs text-slate-500">Round</p>
                  <p className="text-sm text-slate-300">{nextMatch.round_name}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-slate-500">Tournament</p>
                <p className="text-sm text-slate-300">{nextMatch.tournamentName}</p>
              </div>
            </div>
          </div>
        )}

        {/* Partner invites — full-width banner above the tile grid */}
        {partnerInvites.length > 0 && (
          <div className="mt-8">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <PartnerInvitesBanner invites={partnerInvites as any} />
          </div>
        )}

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Quick actions — always first column, mirrors Admin layout */}
          <div className="rounded-xl bg-surface-card p-6 ring-1 ring-surface-border">
            <h2 className="text-base font-semibold text-white">Quick actions</h2>
            <div className="mt-4 space-y-3">
              <Link
                href="/events"
                className="flex items-center gap-3 rounded-lg border border-surface-border p-3 hover:bg-surface transition-colors"
              >
                <span className="text-xl">🎾</span>
                <span className="text-sm font-medium text-slate-300">Browse events</span>
              </Link>
              <Link
                href="/partners"
                className="flex items-center gap-3 rounded-lg border border-surface-border p-3 hover:bg-surface transition-colors"
              >
                <span className="text-xl">🤝</span>
                <span className="text-sm font-medium text-slate-300">Find a partner</span>
              </Link>
              <Link
                href={player ? `/p/${player.username}` : '#'}
                className="flex items-center gap-3 rounded-lg border border-surface-border p-3 hover:bg-surface transition-colors"
              >
                <span className="text-xl">👤</span>
                <span className="text-sm font-medium text-slate-300">View my profile</span>
              </Link>
            </div>
          </div>

          {/* My registrations — spans the remaining 2 columns */}
          {myEntries.length > 0 && (() => {
            const ENTRY_STATUS_BADGE: Record<string, { label: string; className: string }> = {
              active:      { label: 'Registered',       className: 'bg-accent-500/20 text-accent-400' },
              pending:     { label: 'Pending approval',  className: 'bg-amber-900/40 text-amber-300' },
              waitlisted:  { label: 'Waitlisted',        className: 'bg-slate-700/50 text-slate-300' },
              provisional: { label: 'Invited',           className: 'bg-brand-900/40 text-brand-300' },
            };
            return (
              <div className="lg:col-span-2 rounded-xl bg-surface-card p-6 ring-1 ring-surface-border">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-semibold text-white">My registrations</h2>
                  <Link href="/events" className="text-xs text-brand-400 hover:text-brand-300 transition-colors">
                    Browse events →
                  </Link>
                </div>
                <div className="space-y-2">
                  {myEntries.slice(0, 5).map((entry) => {
                    const cat   = entry.tournament_categories as { id: string; name: string; play_format: string } | null;
                    const t     = entry.tournaments as { id: string; name: string; slug: string; start_date: string; status: string } | null;
                    const badge = ENTRY_STATUS_BADGE[entry.status as string] ?? { label: entry.status, className: 'text-slate-500' };
                    return (
                      <Link
                        key={entry.id}
                        href={`/events/${t?.slug}`}
                        className="flex items-center justify-between rounded-lg p-3 hover:bg-surface transition-colors"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-200 truncate">{t?.name}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{cat?.name}</p>
                        </div>
                        <span className={`ml-3 shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${badge.className}`}>
                          {badge.label}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
      </main>
    </div>
  );
}
