import type { Metadata } from 'next';
import Link from 'next/link';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { AppNav } from '@/components/layout/AppNav';
import { PlayerSearchInput } from '@/components/player/PlayerSearchInput';

export const metadata: Metadata = { title: 'Global Rankings' };

export default async function RankingsPage({
  searchParams,
}: {
  searchParams: Promise<{ format?: string; page?: string; q?: string; scope?: string }>;
}) {
  const sp = await searchParams;
  const format = sp.format ?? 'all';
  const page = Math.max(1, parseInt(sp.page ?? '1', 10));
  const searchQuery = (sp.q ?? '').trim();
  const scope = sp.scope ?? 'global'; // 'global' | 'club'
  const perPage = 50;
  const offset = (page - 1) * perPage;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const admin = createAdminClient();

  // ── Club scope: resolve the viewer's club and its member IDs ─────────────
  type ClubScope = { clubName: string | null; clubPlayerIds: string[] | null; noClub: boolean };

  async function resolveClubScope(): Promise<ClubScope> {
    if (!(scope === 'club' && user)) return { clubName: null, clubPlayerIds: null, noClub: false };

    // Find the viewer's current club affiliation
    const { data: affil } = await admin
      .from('club_affiliations')
      .select('club_id, clubs!inner(name)')
      .eq('player_id', user.id)
      .eq('is_current', true)
      .maybeSingle();

    if (affil) {
      const clubId = affil.club_id;
      const clubName = (affil.clubs as { name: string } | null)?.name ?? null;

      // Get all current members of that club
      const { data: members } = await admin
        .from('club_affiliations')
        .select('player_id')
        .eq('club_id', clubId)
        .eq('is_current', true);

      return { clubName, clubPlayerIds: (members ?? []).map((m) => m.player_id), noClub: false };
    }

    // Try club_managers as fallback
    const { data: mgr } = await admin
      .from('club_managers')
      .select('club_id, clubs!inner(name)')
      .eq('player_id', user.id)
      .maybeSingle();

    if (mgr) {
      const clubId = mgr.club_id;
      const clubName = (mgr.clubs as { name: string } | null)?.name ?? null;

      const { data: mgrMembers } = await admin
        .from('club_managers')
        .select('player_id')
        .eq('club_id', clubId);
      return { clubName, clubPlayerIds: (mgrMembers ?? []).map((m) => m.player_id), noClub: false };
    }

    return { clubName: null, clubPlayerIds: null, noClub: true };
  }

  // ── Player search: resolve matching IDs ────────────────────────────────────
  async function resolveSearchPlayerIds(): Promise<string[] | null> {
    if (!searchQuery) return null;
    const { data: matched } = await admin
      .from('players')
      .select('id')
      .or(`full_name.ilike.%${searchQuery}%,username.ilike.%${searchQuery}%`);
    return (matched ?? []).map((p) => p.id);
  }

  // Independent lookups run in parallel; the viewer's rank-count query depends
  // on their own rating, so it's issued after myStats resolves.
  const [myStats, { clubName, clubPlayerIds, noClub }, searchPlayerIds] = await Promise.all([
    user
      ? admin.from('global_stats').select('current_rating').eq('player_id', user.id).maybeSingle()
      : Promise.resolve({ data: null }),
    resolveClubScope(),
    resolveSearchPlayerIds(),
  ]);

  // ── Viewer's own rank (if signed in) ───────────────────────────────────────
  type MyRank = { rank: number; rating: number } | null;
  let myRank: MyRank = null;

  if (myStats?.data) {
    // Count players with a strictly higher rating
    const { count } = await admin
      .from('global_stats')
      .select('player_id', { count: 'exact', head: true })
      .gt('current_rating', myStats.data.current_rating);

    myRank = { rank: (count ?? 0) + 1, rating: myStats.data.current_rating };
  }

  // Build query — global_stats joined with players
  let q = admin
    .from('global_stats')
    .select(`
      player_id,
      current_rating,
      peak_rating,
      wins,
      total_matches,
      win_rate,
      singles_matches,
      singles_wins,
      doubles_matches,
      doubles_wins,
      mixed_doubles_matches,
      mixed_doubles_wins,
      players!inner(id, full_name, username, location, photo_url)
    `, { count: 'exact' });

  // Filter by format
  if (format === 'singles') {
    q = q.gt('singles_matches', 0);
  } else if (format === 'doubles') {
    q = q.gt('doubles_matches', 0);
  } else if (format === 'mixed') {
    q = q.gt('mixed_doubles_matches', 0);
  }

  // Filter by club scope
  if (scope === 'club' && clubPlayerIds !== null) {
    const ids = clubPlayerIds.length > 0 ? clubPlayerIds : ['00000000-0000-0000-0000-000000000000'];
    q = q.in('player_id', ids);
  }

  // Filter by search
  if (searchPlayerIds !== null) {
    // If search returned no matches, use a sentinel that matches nothing
    const ids = searchPlayerIds.length > 0 ? searchPlayerIds : ['00000000-0000-0000-0000-000000000000'];
    q = q.in('player_id', ids);
  }

  const { data, count } = await q
    .order('current_rating', { ascending: false })
    .range(offset, offset + perPage - 1);

  const totalPages = Math.ceil((count ?? 0) / perPage);

  type StatsRow = {
    player_id: string;
    current_rating: number;
    peak_rating: number;
    wins: number;
    total_matches: number;
    win_rate: number;
    singles_matches: number;
    singles_wins: number;
    doubles_matches: number;
    doubles_wins: number;
    mixed_doubles_matches: number;
    mixed_doubles_wins: number;
    players: { id: string; full_name: string; username: string; location: string | null; photo_url: string | null } | null;
  };

  const rows = (data ?? []) as unknown as StatsRow[];

  const formats = [
    { id: 'all', label: 'All formats' },
    { id: 'singles', label: 'Singles' },
    { id: 'doubles', label: 'Doubles' },
    { id: 'mixed', label: 'Mixed doubles' },
  ];

  function formatMatches(row: StatsRow) {
    if (format === 'singles') return `${row.singles_wins}W / ${row.singles_matches - row.singles_wins}L`;
    if (format === 'doubles') return `${row.doubles_wins}W / ${row.doubles_matches - row.doubles_wins}L`;
    if (format === 'mixed') return `${row.mixed_doubles_wins}W / ${row.mixed_doubles_matches - row.mixed_doubles_wins}L`;
    return `${row.wins}W / ${row.total_matches - row.wins}L`;
  }

  return (
    <div className="min-h-screen bg-surface">
      <AppNav />

      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">Global Rankings</h1>
          <p className="mt-1 text-sm text-slate-500">Rated players across all registered tournaments</p>
        </div>

        {/* Viewer's own rank callout */}
        {myRank && (
          <div className="mb-6 flex items-center gap-4 rounded-xl bg-brand-900/20 ring-1 ring-brand-700/30 px-5 py-4">
            <span className="text-2xl">🏅</span>
            <div>
              <p className="text-sm font-semibold text-white">
                You are ranked{' '}
                <span className="text-brand-300">#{myRank.rank}</span>
                {' '}globally
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                Current rating: <span className="text-slate-300 font-medium tabular-nums">{myRank.rating.toFixed(0)}</span>
              </p>
            </div>
            {myRank.rank > perPage && (
              <Link
                href={`/rankings?format=${format}&page=${Math.ceil(myRank.rank / perPage)}`}
                className="ml-auto shrink-0 text-xs text-brand-400 hover:text-brand-300 transition-colors"
              >
                Jump to my page →
              </Link>
            )}
          </div>
        )}

        {/* Search */}
        <div className="mb-4">
          <PlayerSearchInput defaultValue={searchQuery} />
        </div>

        {/* Scope tabs — global vs my club */}
        {user && (
          <div className="mb-4 flex items-center gap-1 rounded-full bg-surface-card p-1 ring-1 ring-surface-border text-xs w-fit">
            <Link
              href={`/rankings?format=${format}${searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : ''}`}
              className={`rounded-full px-3 py-1 font-medium transition-colors ${
                scope === 'global' ? 'bg-brand-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Global
            </Link>
            <Link
              href={`/rankings?scope=club&format=${format}${searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : ''}`}
              className={`rounded-full px-3 py-1 font-medium transition-colors ${
                scope === 'club' ? 'bg-brand-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              My club
            </Link>
          </div>
        )}

        {/* Club scope heading */}
        {scope === 'club' && !noClub && clubName && (
          <div className="mb-4 rounded-xl bg-violet-900/20 ring-1 ring-violet-700/30 px-5 py-3">
            <p className="text-sm font-semibold text-violet-200">
              🏢 {clubName} leaderboard
            </p>
            <p className="text-xs text-violet-400 mt-0.5">Rankings among your club members</p>
          </div>
        )}

        {/* Club not found message */}
        {scope === 'club' && noClub && (
          <div className="mb-6 rounded-xl bg-surface-card p-8 text-center ring-1 ring-surface-border">
            <p className="text-2xl mb-2">🏢</p>
            <p className="text-sm font-medium text-white mb-1">Not a member of any club</p>
            <p className="text-xs text-slate-500">
              You need to be affiliated with a club to see its leaderboard.
            </p>
          </div>
        )}

        {/* Format filter */}
        <div className="mb-6 flex flex-wrap gap-2">
          {formats.map((f) => {
            const href = `/rankings?format=${f.id}${scope === 'club' ? '&scope=club' : ''}${searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : ''}`;
            return (
              <Link
                key={f.id}
                href={href}
                className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
                  format === f.id
                    ? 'bg-brand-600 text-white'
                    : 'border border-surface-border text-slate-400 hover:border-slate-500 hover:text-slate-300'
                }`}
              >
                {f.label}
              </Link>
            );
          })}
        </div>

        {rows.length === 0 ? (
          <div className="rounded-xl bg-surface-card p-10 text-center ring-1 ring-surface-border">
            <p className="text-2xl mb-2">🏆</p>
            {searchQuery ? (
              <>
                <p className="text-sm font-medium text-white mb-1">No players found</p>
                <p className="text-xs text-slate-500">Try a different name or username.</p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-white mb-1">No ranked players yet</p>
                <p className="text-xs text-slate-500">Players appear here after completing rated matches.</p>
              </>
            )}
          </div>
        ) : (
          <>
            {/* Table */}
            <div className="rounded-xl bg-surface-card ring-1 ring-surface-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-border">
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 w-12">#</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-slate-500">Player</th>
                    <th className="px-3 py-3 text-center text-xs font-medium text-slate-500 w-24 hidden sm:table-cell">Location</th>
                    <th className="px-3 py-3 text-center text-xs font-medium text-slate-500 w-20">Rating</th>
                    <th className="px-3 py-3 text-center text-xs font-medium text-slate-500 w-20 hidden md:table-cell">Peak</th>
                    <th className="px-3 py-3 text-center text-xs font-medium text-slate-500 w-24">W/L</th>
                    <th className="px-3 py-3 text-center text-xs font-medium text-slate-500 w-16">Win%</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {rows.map((row, i) => {
                    const rank = offset + i + 1;
                    const isTop3 = rank <= 3;
                    const rankIcon = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null;
                    return (
                      <tr
                        key={row.player_id}
                        className={`hover:bg-surface-card/50 transition-colors ${isTop3 ? 'bg-brand-600/5' : ''}`}
                      >
                        <td className="px-4 py-3 text-slate-500 tabular-nums">
                          {rankIcon ?? rank}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2.5">
                            {row.players?.photo_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={row.players.photo_url}
                                alt=""
                                className="h-7 w-7 rounded-full object-cover"
                              />
                            ) : (
                              <div className="h-7 w-7 rounded-full bg-brand-600/30 flex items-center justify-center text-xs font-bold text-brand-400">
                                {row.players?.full_name.charAt(0) ?? '?'}
                              </div>
                            )}
                            <p className={`font-medium truncate ${isTop3 ? 'text-white' : 'text-slate-200'}`}>
                              {row.players?.full_name ?? 'Unknown'}
                            </p>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-center text-xs text-slate-600 hidden sm:table-cell">
                          {row.players?.location || '—'}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className={`font-bold tabular-nums ${isTop3 ? 'text-white text-base' : 'text-slate-200'}`}>
                            {row.current_rating.toFixed(0)}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-center text-xs text-slate-600 tabular-nums hidden md:table-cell">
                          {row.peak_rating.toFixed(0)}
                        </td>
                        <td className="px-3 py-3 text-center text-xs text-slate-400 tabular-nums">
                          {formatMatches(row)}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className={`text-xs font-semibold tabular-nums ${
                            row.win_rate >= 0.6 ? 'text-accent-400' : row.win_rate >= 0.4 ? 'text-slate-400' : 'text-slate-600'
                          }`}>
                            {(row.win_rate * 100).toFixed(0)}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-6 flex items-center justify-between">
                <p className="text-xs text-slate-600">
                  {offset + 1}–{Math.min(offset + perPage, count ?? 0)} of {count} players
                </p>
                <div className="flex items-center gap-2">
                  {page > 1 && (
                    <Link
                      href={`/rankings?format=${format}&page=${page - 1}${scope === 'club' ? '&scope=club' : ''}${searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : ''}`}
                      className="rounded-lg border border-surface-border px-3 py-1.5 text-xs text-slate-400 hover:border-slate-500 hover:text-slate-300 transition-colors"
                    >
                      ← Prev
                    </Link>
                  )}
                  <span className="text-xs text-slate-600">Page {page} of {totalPages}</span>
                  {page < totalPages && (
                    <Link
                      href={`/rankings?format=${format}&page=${page + 1}${scope === 'club' ? '&scope=club' : ''}${searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : ''}`}
                      className="rounded-lg border border-surface-border px-3 py-1.5 text-xs text-slate-400 hover:border-slate-500 hover:text-slate-300 transition-colors"
                    >
                      Next →
                    </Link>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
