'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Database } from '@pickleball/db';
import type { DisplaySlide } from '@pickleball/shared';

type Tournament = Database['public']['Tables']['tournaments']['Row'] & {
  clubs: Pick<
    Database['public']['Tables']['clubs']['Row'],
    'id' | 'name' | 'logo_url' | 'brand_primary_color' | 'brand_secondary_color'
  > | null;
};
type DisplayState = Database['public']['Tables']['display_state']['Row'];

interface Props {
  tournament: Tournament;
  initialDisplayState: DisplayState;
}

// ── Shared match type with player names ───────────────────────────────────────
type LiveMatch = {
  id: string;
  court: number | null;
  round_name: string | null;
  sets: { set_number: number; score_a: number; score_b: number }[];
  name_a: string;
  name_b: string;
};

const MATCH_WITH_PLAYERS = `
  id, court, round_name, sets,
  ea:tournament_entries!entry_a_id(players!player_id(full_name)),
  eb:tournament_entries!entry_b_id(players!player_id(full_name))
` as const;

function extractName(entry: unknown): string {
  const e = entry as { players: { full_name: string } | null } | null;
  return e?.players?.full_name ?? 'TBD';
}

export function DisplayScreen({ tournament, initialDisplayState }: Props) {
  const [displayState, setDisplayState] = useState<DisplayState>(initialDisplayState);
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [isConnected, setIsConnected] = useState(true);

  useEffect(() => {
    setCurrentTime(new Date());
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`tournament:${tournament.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'display_state', filter: `tournament_id=eq.${tournament.id}` },
        (payload) => setDisplayState(payload.new as DisplayState),
      )
      .subscribe((status) => setIsConnected(status === 'SUBSCRIBED'));
    return () => { supabase.removeChannel(channel); };
  }, [tournament.id]);

  const club = tournament.clubs;
  const primaryColor = club?.brand_primary_color ?? '#7c3aed';

  return (
    <div
      className="relative flex h-screen w-screen flex-col overflow-hidden bg-gray-950 text-white"
      style={{ fontFamily: 'system-ui, sans-serif' }}
    >
      {!isConnected && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="rounded-xl bg-gray-900 px-8 py-6 text-center">
            <div className="mb-2 animate-spin text-2xl">⟳</div>
            <p className="text-lg font-semibold">Reconnecting...</p>
          </div>
        </div>
      )}

      <TopBar
        tournamentName={tournament.name}
        clubName={club?.name ?? ''}
        currentTime={currentTime}
        primaryColor={primaryColor}
        currentSlide={displayState.current_slide as DisplaySlide}
      />

      <main className="flex flex-1 items-center justify-center p-8 overflow-hidden">
        <SlideContent
          slide={displayState.current_slide as DisplaySlide}
          tournamentId={tournament.id}
        />
      </main>

      <BottomBar primaryColor={primaryColor} />
    </div>
  );
}

// ── Top bar ───────────────────────────────────────────────────────────────────
function TopBar({
  tournamentName,
  clubName,
  currentTime,
  primaryColor,
  currentSlide,
}: {
  tournamentName: string;
  clubName: string;
  currentTime: Date | null;
  primaryColor: string;
  currentSlide: DisplaySlide;
}) {
  const slideLabels: Record<DisplaySlide, string> = {
    live_scores: 'Live Scores',
    group_standings: 'Group Standings',
    live_bracket: 'Live Bracket',
    upcoming_matches: 'Upcoming Matches',
    full_schedule: 'Full Schedule',
    category_podium: 'Category Podium',
    announcement: 'Announcement',
    wrap_up: 'Tournament Wrap-Up',
  };

  return (
    <div className="flex shrink-0 items-center justify-between px-10 py-5" style={{ backgroundColor: primaryColor }}>
      <div>
        <p className="text-xl font-black leading-tight tracking-tight">{tournamentName}</p>
        <p className="text-sm opacity-75">{clubName} · {slideLabels[currentSlide]}</p>
      </div>
      <div className="text-right font-mono text-3xl font-black tabular-nums">
        {currentTime?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) ?? ''}
      </div>
    </div>
  );
}

// ── Bottom bar ────────────────────────────────────────────────────────────────
function BottomBar({ primaryColor }: { primaryColor: string }) {
  return (
    <div className="flex shrink-0 items-center justify-between bg-gray-900/80 px-10 py-2.5">
      <p className="text-xs font-bold tracking-widest opacity-40">PLAYOFFE</p>
      <div className="h-1 w-24 rounded-full opacity-30" style={{ backgroundColor: primaryColor }} />
    </div>
  );
}

// ── Slide router ──────────────────────────────────────────────────────────────
function SlideContent({ slide, tournamentId }: { slide: DisplaySlide; tournamentId: string }) {
  switch (slide) {
    case 'live_scores':      return <LiveScoresSlide tournamentId={tournamentId} />;
    case 'upcoming_matches': return <UpcomingMatchesSlide tournamentId={tournamentId} />;
    case 'announcement':     return <AnnouncementSlide tournamentId={tournamentId} />;
    case 'group_standings':  return <GroupStandingsSlide tournamentId={tournamentId} />;
    case 'live_bracket':     return <LiveBracketSlide tournamentId={tournamentId} />;
    case 'category_podium':  return <CategoryPodiumSlide tournamentId={tournamentId} />;
    case 'wrap_up':          return <WrapUpSlide tournamentId={tournamentId} />;
    default:
      return (
        <div className="text-center opacity-20">
          <p className="text-5xl font-black">{slide.replace(/_/g, ' ').toUpperCase()}</p>
          <p className="mt-2 text-sm">Coming soon</p>
        </div>
      );
  }
}

// ── Live scores ───────────────────────────────────────────────────────────────
function LiveScoresSlide({ tournamentId }: { tournamentId: string }) {
  const [matches, setMatches] = useState<LiveMatch[]>([]);
  const supabase = createClient();

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('matches')
      .select(MATCH_WITH_PLAYERS)
      .eq('tournament_id', tournamentId)
      .eq('status', 'in_progress')
      .order('court');

    setMatches(
      (data ?? []).map((m) => ({
        id: m.id,
        court: m.court,
        round_name: m.round_name,
        sets: (m.sets as { set_number: number; score_a: number; score_b: number }[]) ?? [],
        name_a: extractName(m.ea),
        name_b: extractName(m.eb),
      })),
    );
  }, [tournamentId, supabase]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`live-scores:${tournamentId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches',
        filter: `tournament_id=eq.${tournamentId}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tournamentId, load, supabase]);

  if (matches.length === 0) {
    return (
      <div className="text-center">
        <p className="text-6xl mb-4">🎾</p>
        <p className="text-3xl font-semibold text-gray-500">No live matches right now</p>
      </div>
    );
  }

  return (
    <div className="grid w-full grid-cols-1 gap-6 md:grid-cols-2">
      {matches.slice(0, 4).map((match) => {
        const current = match.sets[match.sets.length - 1];
        const scoreA = match.sets.filter((s) => s.score_a > s.score_b).length;
        const scoreB = match.sets.filter((s) => s.score_b > s.score_a).length;
        return (
          <div key={match.id} className="rounded-2xl bg-gray-800/80 p-6 ring-1 ring-white/5">
            <p className="mb-5 text-sm font-semibold uppercase tracking-widest text-gray-400">
              {match.court ? `Court ${match.court}` : ''}
              {match.court && match.round_name ? ' · ' : ''}
              {match.round_name ?? ''}
            </p>

            {/* Players + current set score */}
            <div className="flex items-center gap-4">
              <p className="flex-1 truncate text-2xl font-bold leading-tight">{match.name_a}</p>
              <div className="shrink-0 text-center">
                <p className="font-mono text-6xl font-black tabular-nums leading-none">
                  {current?.score_a ?? 0}
                  <span className="mx-2 text-gray-600">:</span>
                  {current?.score_b ?? 0}
                </p>
                <p className="mt-1 text-xs text-gray-500">Set {match.sets.length}</p>
              </div>
              <p className="flex-1 truncate text-right text-2xl font-bold leading-tight">{match.name_b}</p>
            </div>

            {/* Set score summary */}
            {match.sets.length > 1 && (
              <div className="mt-4 flex items-center justify-center gap-3">
                <span className="text-sm font-bold text-gray-300">{scoreA}</span>
                <div className="flex gap-1.5">
                  {match.sets.map((s, i) => (
                    <span key={i} className="rounded bg-gray-700 px-2 py-0.5 font-mono text-xs text-gray-400">
                      {s.score_a}-{s.score_b}
                    </span>
                  ))}
                </div>
                <span className="text-sm font-bold text-gray-300">{scoreB}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Upcoming matches ──────────────────────────────────────────────────────────
function UpcomingMatchesSlide({ tournamentId }: { tournamentId: string }) {
  const [matches, setMatches] = useState<(LiveMatch & { scheduled_time: string | null; category_name: string })[]>([]);
  const supabase = createClient();

  useEffect(() => {
    supabase
      .from('matches')
      .select(`${MATCH_WITH_PLAYERS}, scheduled_time, tc:tournament_categories!category_id(name)`)
      .eq('tournament_id', tournamentId)
      .eq('status', 'scheduled')
      .not('entry_a_id', 'is', null)
      .not('entry_b_id', 'is', null)
      .order('scheduled_time', { nullsFirst: false })
      .order('court', { nullsFirst: false })
      .limit(8)
      .then(({ data }) => {
        setMatches(
          (data ?? []).map((m) => ({
            id: m.id,
            court: m.court,
            round_name: m.round_name,
            sets: [],
            name_a: extractName(m.ea),
            name_b: extractName(m.eb),
            scheduled_time: m.scheduled_time,
            category_name: (m.tc as { name: string } | null)?.name ?? '',
          })),
        );
      });
  }, [tournamentId, supabase]);

  if (matches.length === 0) {
    return (
      <div className="text-center">
        <p className="text-6xl mb-4">📋</p>
        <p className="text-3xl font-semibold text-gray-500">No upcoming matches scheduled</p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-3">
      {matches.map((match) => (
        <div
          key={match.id}
          className="flex items-center gap-6 rounded-xl bg-gray-800/60 px-6 py-4 ring-1 ring-white/5"
        >
          {/* Time */}
          <p className="w-16 shrink-0 font-mono text-sm text-gray-400">
            {match.scheduled_time
              ? new Date(match.scheduled_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : '--:--'}
          </p>

          {/* Court */}
          {match.court && (
            <p className="w-20 shrink-0 text-center text-sm font-bold text-gray-300">
              Court {match.court}
            </p>
          )}

          {/* Match */}
          <p className="flex-1 text-lg font-semibold">
            {match.name_a}
            <span className="mx-3 text-gray-500 font-normal">vs</span>
            {match.name_b}
          </p>

          {/* Round / category */}
          <p className="shrink-0 text-sm text-gray-500">
            {match.category_name}
            {match.category_name && match.round_name ? ' · ' : ''}
            {match.round_name ?? ''}
          </p>
        </div>
      ))}
    </div>
  );
}

// ── Group Standings ───────────────────────────────────────────────────────────
type GroupMatchRow = {
  categoryName: string;
  groupName: string;
  entryAId: string | null;
  entryBId: string | null;
  nameA: string;
  nameB: string;
  winnerId: string | null;
  status: string;
};

type Standing = {
  entryId: string;
  name: string;
  played: number;
  wins: number;
  losses: number;
  points: number;
};

function computeStandings(matches: GroupMatchRow[]): Standing[] {
  const map = new Map<string, Standing>();

  const ensure = (id: string, name: string) => {
    if (!map.has(id)) map.set(id, { entryId: id, name, played: 0, wins: 0, losses: 0, points: 0 });
    return map.get(id)!;
  };

  for (const m of matches) {
    if (m.status !== 'completed' && m.status !== 'walkover') continue;
    if (!m.entryAId || !m.entryBId) continue;

    const a = ensure(m.entryAId, m.nameA);
    const b = ensure(m.entryBId, m.nameB);

    a.played += 1;
    b.played += 1;

    if (m.winnerId === m.entryAId) {
      a.wins += 1; a.points += 2;
      b.losses += 1;
    } else if (m.winnerId === m.entryBId) {
      b.wins += 1; b.points += 2;
      a.losses += 1;
    }
  }

  return Array.from(map.values()).sort((a, b) => b.points - a.points || b.wins - a.wins);
}

function GroupStandingsSlide({ tournamentId }: { tournamentId: string }) {
  const [groups, setGroups] = useState<{ categoryName: string; groupName: string; standings: Standing[] }[]>([]);
  const supabase = createClient();

  useEffect(() => {
    supabase
      .from('matches')
      .select(`
        id, status, winner_entry_id, group_name,
        tc:tournament_categories!category_id(name),
        ea:tournament_entries!entry_a_id(id, players!player_id(full_name)),
        eb:tournament_entries!entry_b_id(id, players!player_id(full_name))
      `)
      .eq('tournament_id', tournamentId)
      .not('group_name', 'is', null)
      .then(({ data }) => {
        if (!data) return;

        const rows: GroupMatchRow[] = data.map((m) => {
          const ea = m.ea as { id: string; players: { full_name: string } | null } | null;
          const eb = m.eb as { id: string; players: { full_name: string } | null } | null;
          return {
            categoryName: (m.tc as { name: string } | null)?.name ?? '',
            groupName: m.group_name ?? '',
            entryAId: ea?.id ?? null,
            entryBId: eb?.id ?? null,
            nameA: ea?.players?.full_name ?? 'TBD',
            nameB: eb?.players?.full_name ?? 'TBD',
            winnerId: m.winner_entry_id,
            status: m.status,
          };
        });

        // Group by category + group name
        const groupMap = new Map<string, GroupMatchRow[]>();
        for (const r of rows) {
          const key = `${r.categoryName}__${r.groupName}`;
          const list = groupMap.get(key) ?? [];
          list.push(r);
          groupMap.set(key, list);
        }

        const result = Array.from(groupMap.entries()).map(([key, matches]) => {
          const [categoryName, groupName] = key.split('__');
          return { categoryName, groupName, standings: computeStandings(matches) };
        });

        setGroups(result);
      });
  }, [tournamentId, supabase]);

  if (groups.length === 0) {
    return (
      <div className="text-center">
        <p className="text-6xl mb-4">📊</p>
        <p className="text-3xl font-semibold text-gray-500">No group stage data yet</p>
      </div>
    );
  }

  return (
    <div className="w-full grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 overflow-auto max-h-full">
      {groups.map(({ categoryName, groupName, standings }) => (
        <div key={`${categoryName}${groupName}`} className="rounded-2xl bg-gray-800/80 p-5 ring-1 ring-white/5">
          <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-gray-400">{categoryName}</p>
          <p className="mb-4 text-lg font-bold text-white">{groupName}</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700 text-xs uppercase tracking-wider text-gray-500">
                <th className="pb-2 text-left font-medium">Player</th>
                <th className="pb-2 text-center font-medium">P</th>
                <th className="pb-2 text-center font-medium">W</th>
                <th className="pb-2 text-center font-medium">L</th>
                <th className="pb-2 text-right font-medium">Pts</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((s, i) => (
                <tr key={s.entryId} className={`border-b border-gray-800/60 ${i === 0 ? 'text-white' : 'text-gray-300'}`}>
                  <td className="py-2 pr-2">
                    <span className={`mr-2 text-xs font-bold ${i === 0 ? 'text-yellow-400' : i === 1 ? 'text-gray-400' : 'text-gray-600'}`}>
                      {i + 1}
                    </span>
                    <span className={`font-${i === 0 ? 'bold' : 'normal'} truncate`}>{s.name}</span>
                  </td>
                  <td className="py-2 text-center text-gray-400">{s.played}</td>
                  <td className="py-2 text-center font-semibold text-white">{s.wins}</td>
                  <td className="py-2 text-center text-gray-500">{s.losses}</td>
                  <td className="py-2 text-right font-black tabular-nums">{s.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

// ── Live Bracket ──────────────────────────────────────────────────────────────
type BracketMatchTV = {
  id: string;
  round: number;
  roundName: string | null;
  nameA: string;
  nameB: string;
  setsA: number;
  setsB: number;
  winnerId: string | null;
  entryAId: string | null;
  entryBId: string | null;
  status: string;
};

type CategoryBracketTV = {
  categoryName: string;
  maxRound: number;
  rounds: Map<number, BracketMatchTV[]>;
};

function TVMatchCard({ match, primary }: { match: BracketMatchTV; primary: string }) {
  const aWins = match.status === 'completed' || match.status === 'walkover'
    ? match.winnerId === match.entryAId
    : false;
  const bWins = match.status === 'completed' || match.status === 'walkover'
    ? match.winnerId === match.entryBId
    : false;
  const isLive = match.status === 'in_progress';

  return (
    <div className={`rounded-xl overflow-hidden ring-1 ${isLive ? 'ring-green-500/50' : 'ring-white/10'}`}
      style={isLive ? { boxShadow: `0 0 20px ${primary}40` } : undefined}
    >
      {isLive && (
        <div className="px-3 py-1 text-center text-xs font-bold uppercase tracking-widest text-green-400 bg-green-900/40">
          Live
        </div>
      )}
      {[
        { name: match.nameA, sets: match.setsA, wins: aWins, entryId: match.entryAId },
        { name: match.nameB, sets: match.setsB, wins: bWins, entryId: match.entryBId },
      ].map((player, i) => (
        <div
          key={i}
          className={`flex items-center justify-between gap-3 px-4 py-3 ${
            i === 0 ? 'border-b border-white/5' : ''
          } ${player.wins ? 'bg-white/5' : ''}`}
        >
          <span className={`flex-1 truncate text-lg font-${player.wins ? 'bold' : 'normal'} ${
            player.entryId ? (player.wins ? 'text-white' : 'text-gray-400') : 'text-gray-600 italic'
          }`}>
            {player.entryId ? player.name : 'TBD'}
          </span>
          {(isLive || player.wins) && (
            <span className={`shrink-0 font-mono text-2xl font-black tabular-nums ${
              player.wins ? 'text-white' : 'text-gray-400'
            }`}>
              {player.sets}
            </span>
          )}
          {player.wins && <span className="shrink-0 text-sm text-yellow-400">✓</span>}
        </div>
      ))}
    </div>
  );
}

function LiveBracketSlide({ tournamentId }: { tournamentId: string }) {
  const [brackets, setBrackets] = useState<CategoryBracketTV[]>([]);
  const supabase = createClient();

  const load = useCallback(async () => {
    // Get active elimination categories
    const { data: cats } = await supabase
      .from('tournament_categories')
      .select('id, name, draw_format, status')
      .eq('tournament_id', tournamentId)
      .in('status', ['draw_generated', 'in_progress', 'completed'])
      .in('draw_format', ['single_elimination', 'double_elimination']);

    if (!cats || cats.length === 0) { setBrackets([]); return; }

    const result: CategoryBracketTV[] = [];

    for (const cat of cats) {
      const { data: matches } = await supabase
        .from('matches')
        .select(`
          id, round, round_name, status, winner_entry_id, sets,
          ea:tournament_entries!entry_a_id(id, players!player_id(full_name)),
          eb:tournament_entries!entry_b_id(id, players!player_id(full_name))
        `)
        .eq('category_id', cat.id)
        .order('round', { ascending: true });

      if (!matches || matches.length === 0) continue;

      const maxRound = Math.max(...matches.map((m) => m.round));
      const roundMap = new Map<number, BracketMatchTV[]>();

      for (const m of matches) {
        const ea = m.ea as { id: string; players: { full_name: string } | null } | null;
        const eb = m.eb as { id: string; players: { full_name: string } | null } | null;
        const sets = (m.sets as { score_a: number; score_b: number }[]) ?? [];
        const setsA = sets.filter((s) => s.score_a > s.score_b).length;
        const setsB = sets.filter((s) => s.score_b > s.score_a).length;

        const row: BracketMatchTV = {
          id: m.id,
          round: m.round,
          roundName: m.round_name,
          nameA: ea?.players?.full_name ?? 'TBD',
          nameB: eb?.players?.full_name ?? 'TBD',
          setsA,
          setsB,
          winnerId: m.winner_entry_id,
          entryAId: ea?.id ?? null,
          entryBId: eb?.id ?? null,
          status: m.status,
        };

        const list = roundMap.get(m.round) ?? [];
        list.push(row);
        roundMap.set(m.round, list);
      }

      result.push({ categoryName: cat.name, maxRound, rounds: roundMap });
    }

    setBrackets(result);
  }, [tournamentId, supabase]);

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`live-bracket:${tournamentId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches',
        filter: `tournament_id=eq.${tournamentId}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [tournamentId, load, supabase]);

  if (brackets.length === 0) {
    return (
      <div className="text-center">
        <p className="text-6xl mb-4">🏆</p>
        <p className="text-3xl font-semibold text-gray-500">No bracket data yet</p>
      </div>
    );
  }

  // Show the first bracket's last 2 rounds (semi + final)
  const bracket = brackets[0];
  const showRounds = [bracket.maxRound - 1, bracket.maxRound].filter((r) => r >= 1 && bracket.rounds.has(r));

  return (
    <div className="w-full max-w-5xl space-y-6">
      <p className="text-center text-2xl font-bold text-white">{bracket.categoryName}</p>
      <div className="flex gap-8 justify-center">
        {showRounds.map((round) => {
          const matches = bracket.rounds.get(round) ?? [];
          const roundName = matches[0]?.roundName ?? `Round ${round}`;
          return (
            <div key={round} className="flex-1 max-w-sm space-y-4">
              <p className="text-center text-xs font-semibold uppercase tracking-widest text-gray-400">{roundName}</p>
              {matches.map((m) => (
                <TVMatchCard key={m.id} match={m} primary="#7c3aed" />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Category Podium ───────────────────────────────────────────────────────────
type PodiumEntry = { categoryName: string; gold: string; silver: string; bronze?: string };

function CategoryPodiumSlide({ tournamentId }: { tournamentId: string }) {
  const [podiums, setPodiums] = useState<PodiumEntry[]>([]);
  const supabase = createClient();

  useEffect(() => {
    (async () => {
      // Get completed categories
      const { data: cats } = await supabase
        .from('tournament_categories')
        .select('id, name')
        .eq('tournament_id', tournamentId)
        .eq('status', 'completed');

      if (!cats || cats.length === 0) { setPodiums([]); return; }

      const result: PodiumEntry[] = [];

      for (const cat of cats) {
        // Find final match (highest round) with completed status
        const { data: matches } = await supabase
          .from('matches')
          .select(`
            id, round, round_name, status, winner_entry_id,
            ea:tournament_entries!entry_a_id(id, players!player_id(full_name)),
            eb:tournament_entries!entry_b_id(id, players!player_id(full_name))
          `)
          .eq('category_id', cat.id)
          .in('status', ['completed', 'walkover'])
          .order('round', { ascending: false })
          .limit(3);

        if (!matches || matches.length === 0) continue;

        const finalMatch = matches[0];
        const ea = finalMatch.ea as { id: string; players: { full_name: string } | null } | null;
        const eb = finalMatch.eb as { id: string; players: { full_name: string } | null } | null;

        if (!finalMatch.winner_entry_id) continue;

        const isAWinner = finalMatch.winner_entry_id === ea?.id;
        const gold = isAWinner ? (ea?.players?.full_name ?? 'Unknown') : (eb?.players?.full_name ?? 'Unknown');
        const silver = isAWinner ? (eb?.players?.full_name ?? 'Unknown') : (ea?.players?.full_name ?? 'Unknown');

        // Look for 3rd-place match
        const thirdMatch = matches.find(
          (m) => (m.round_name?.toLowerCase().includes('3rd') || m.round_name?.toLowerCase().includes('third') || m.round_name?.toLowerCase().includes('bronze')),
        );

        let bronze: string | undefined;
        if (thirdMatch) {
          const tea = thirdMatch.ea as { id: string; players: { full_name: string } | null } | null;
          const teb = thirdMatch.eb as { id: string; players: { full_name: string } | null } | null;
          const winnerId = thirdMatch.winner_entry_id;
          if (winnerId) {
            bronze = winnerId === tea?.id ? (tea?.players?.full_name ?? 'Unknown') : (teb?.players?.full_name ?? 'Unknown');
          }
        }

        result.push({ categoryName: cat.name, gold, silver, bronze });
      }

      setPodiums(result);
    })();
  }, [tournamentId, supabase]);

  if (podiums.length === 0) {
    return (
      <div className="text-center">
        <p className="text-6xl mb-4">🥇</p>
        <p className="text-3xl font-semibold text-gray-500">No completed categories yet</p>
      </div>
    );
  }

  return (
    <div className="w-full grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 max-h-full overflow-auto">
      {podiums.map((p) => (
        <div key={p.categoryName} className="rounded-2xl bg-gray-800/80 p-6 ring-1 ring-white/5 text-center">
          <p className="mb-5 text-sm font-semibold uppercase tracking-widest text-gray-400">{p.categoryName}</p>

          {/* Gold */}
          <div className="mb-4">
            <p className="text-4xl mb-2">🥇</p>
            <p className="text-xl font-black text-yellow-300">{p.gold}</p>
          </div>

          {/* Silver */}
          <div className="mb-4 opacity-85">
            <p className="text-3xl mb-1.5">🥈</p>
            <p className="text-lg font-bold text-gray-300">{p.silver}</p>
          </div>

          {/* Bronze */}
          {p.bronze && (
            <div className="opacity-75">
              <p className="text-2xl mb-1">🥉</p>
              <p className="text-base font-semibold text-amber-600">{p.bronze}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Tournament Wrap-Up ────────────────────────────────────────────────────────
type WrapUpData = {
  totalEntries: number;
  totalMatches: number;
  completedMatches: number;
  categoriesTotal: number;
  categoriesCompleted: number;
  podiums: PodiumEntry[];
};

function WrapUpSlide({ tournamentId }: { tournamentId: string }) {
  const [data, setData] = useState<WrapUpData | null>(null);
  const supabase = createClient();

  useEffect(() => {
    (async () => {
      const [entriesRes, matchesRes, catsRes] = await Promise.all([
        supabase
          .from('tournament_entries')
          .select('id', { count: 'exact', head: true })
          .eq('tournament_id', tournamentId)
          .eq('status', 'active'),
        supabase
          .from('matches')
          .select('id, status')
          .eq('tournament_id', tournamentId),
        supabase
          .from('tournament_categories')
          .select('id, name, status')
          .eq('tournament_id', tournamentId),
      ]);

      const matches = matchesRes.data ?? [];
      const cats = catsRes.data ?? [];
      const completedCats = cats.filter((c) => c.status === 'completed');

      // Build podiums for completed categories
      const podiums: PodiumEntry[] = [];

      for (const cat of completedCats) {
        const { data: finalMatches } = await supabase
          .from('matches')
          .select(`
            id, round, round_name, status, winner_entry_id,
            ea:tournament_entries!entry_a_id(id, players!player_id(full_name)),
            eb:tournament_entries!entry_b_id(id, players!player_id(full_name))
          `)
          .eq('category_id', cat.id)
          .in('status', ['completed', 'walkover'])
          .order('round', { ascending: false })
          .limit(2);

        if (!finalMatches || finalMatches.length === 0) continue;

        const fm = finalMatches[0];
        const ea = fm.ea as { id: string; players: { full_name: string } | null } | null;
        const eb = fm.eb as { id: string; players: { full_name: string } | null } | null;
        if (!fm.winner_entry_id) continue;

        const isAWinner = fm.winner_entry_id === ea?.id;
        podiums.push({
          categoryName: cat.name,
          gold: isAWinner ? (ea?.players?.full_name ?? 'Unknown') : (eb?.players?.full_name ?? 'Unknown'),
          silver: isAWinner ? (eb?.players?.full_name ?? 'Unknown') : (ea?.players?.full_name ?? 'Unknown'),
        });
      }

      setData({
        totalEntries: entriesRes.count ?? 0,
        totalMatches: matches.length,
        completedMatches: matches.filter((m) => m.status === 'completed' || m.status === 'walkover').length,
        categoriesTotal: cats.length,
        categoriesCompleted: completedCats.length,
        podiums,
      });
    })();
  }, [tournamentId, supabase]);

  if (!data) {
    return (
      <div className="text-center">
        <p className="text-6xl mb-4">🏅</p>
        <p className="text-3xl font-semibold text-gray-500">Loading results…</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-5xl space-y-8">
      {/* Stats row */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Players', value: data.totalEntries },
          { label: 'Matches played', value: data.completedMatches },
          { label: 'Categories', value: data.categoriesTotal },
          { label: 'Completed', value: data.categoriesCompleted },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl bg-gray-800/80 p-5 text-center ring-1 ring-white/5">
            <p className="text-4xl font-black tabular-nums text-white">{s.value}</p>
            <p className="mt-1 text-xs text-gray-400 uppercase tracking-widest">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Winners grid */}
      {data.podiums.length > 0 && (
        <div>
          <p className="mb-4 text-center text-sm font-semibold uppercase tracking-widest text-gray-500">
            Category Winners
          </p>
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-3">
            {data.podiums.map((p) => (
              <div key={p.categoryName} className="rounded-xl bg-gray-800/60 px-5 py-4 ring-1 ring-white/5">
                <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">{p.categoryName}</p>
                <p className="flex items-center gap-2 text-lg font-bold text-yellow-300">
                  <span>🥇</span>{p.gold}
                </p>
                <p className="flex items-center gap-2 text-sm text-gray-400 mt-1">
                  <span>🥈</span>{p.silver}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Announcement ──────────────────────────────────────────────────────────────
function AnnouncementSlide({ tournamentId }: { tournamentId: string }) {
  const [announcement, setAnnouncement] = useState<Database['public']['Tables']['announcements']['Row'] | null>(null);
  const supabase = createClient();

  useEffect(() => {
    supabase
      .from('announcements')
      .select('*')
      .eq('tournament_id', tournamentId)
      .is('dismissed_at', null)
      .order('sent_at', { ascending: false })
      .limit(1)
      .single()
      .then(({ data }) => setAnnouncement(data));
  }, [tournamentId, supabase]);

  if (!announcement) {
    return <p className="text-3xl font-semibold text-gray-500">No active announcement</p>;
  }

  const isUrgent = announcement.urgency === 'urgent';

  return (
    <div className={`w-full max-w-4xl rounded-3xl p-14 text-center ${isUrgent ? 'bg-red-900/60 ring-4 ring-red-500' : 'bg-gray-800/70 ring-1 ring-white/10'}`}>
      {isUrgent && (
        <p className="mb-5 text-base font-black uppercase tracking-widest text-red-300">⚠ Urgent</p>
      )}
      <p className="text-5xl font-bold leading-snug">{announcement.message}</p>
      <p className="mt-8 text-sm text-gray-400">
        {new Date(announcement.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </p>
    </div>
  );
}
