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
