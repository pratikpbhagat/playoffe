'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Database } from '@pickleball/db';
import type { DisplaySlide } from '@pickleball/shared';

type Tournament = Database['public']['Tables']['tournaments']['Row'] & {
  clubs: Pick<Database['public']['Tables']['clubs']['Row'],
    'id' | 'name' | 'logo_url' | 'brand_primary_color' | 'brand_secondary_color'> | null;
};
type DisplayState = Database['public']['Tables']['display_state']['Row'];

interface Props {
  tournament: Tournament;
  initialDisplayState: DisplayState;
}

export function DisplayScreen({ tournament, initialDisplayState }: Props) {
  const [displayState, setDisplayState] = useState<DisplayState>(initialDisplayState);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isConnected, setIsConnected] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`tournament:${tournament.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'display_state',
          filter: `tournament_id=eq.${tournament.id}`,
        },
        (payload) => {
          setDisplayState(payload.new as DisplayState);
        },
      )
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tournament.id]);

  const club = tournament.clubs;
  const primaryColor = club?.brand_primary_color ?? '#16a34a';

  return (
    <div
      className="relative flex h-screen w-screen flex-col overflow-hidden bg-gray-950 text-white"
      style={{ fontFamily: 'system-ui, sans-serif' }}
    >
      {!isConnected && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="rounded-xl bg-gray-900 px-8 py-6 text-center">
            <div className="mb-2 text-2xl">⟳</div>
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

      <main className="flex flex-1 items-center justify-center p-8">
        <SlideContent
          slide={displayState.current_slide as DisplaySlide}
          tournamentId={tournament.id}
        />
      </main>

      <BottomBar slideNumber={1} totalSlides={7} nextSlide="Upcoming matches" />
    </div>
  );
}

function TopBar({
  tournamentName,
  clubName,
  currentTime,
  primaryColor,
  currentSlide,
}: {
  tournamentName: string;
  clubName: string;
  currentTime: Date;
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
    <div
      className="flex items-center justify-between px-8 py-4"
      style={{ backgroundColor: primaryColor }}
    >
      <div>
        <p className="text-lg font-bold leading-tight">{tournamentName}</p>
        <p className="text-sm opacity-80">{clubName} · {slideLabels[currentSlide]}</p>
      </div>
      <div className="text-right font-mono text-2xl font-bold tabular-nums">
        {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </div>
    </div>
  );
}

function SlideContent({ slide, tournamentId }: { slide: DisplaySlide; tournamentId: string }) {
  switch (slide) {
    case 'live_scores':
      return <LiveScoresSlide tournamentId={tournamentId} />;
    case 'upcoming_matches':
      return <UpcomingMatchesSlide tournamentId={tournamentId} />;
    case 'announcement':
      return <AnnouncementSlide tournamentId={tournamentId} />;
    default:
      return (
        <div className="text-center">
          <p className="text-6xl font-bold text-gray-500">{slide.replace(/_/g, ' ').toUpperCase()}</p>
        </div>
      );
  }
}

function LiveScoresSlide({ tournamentId }: { tournamentId: string }) {
  const [matches, setMatches] = useState<Database['public']['Tables']['matches']['Row'][]>([]);
  const supabase = createClient();

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('matches')
      .select('*')
      .eq('tournament_id', tournamentId)
      .eq('status', 'in_progress')
      .order('court');
    setMatches(data ?? []);
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
      <p className="text-4xl font-semibold text-gray-500">No live matches right now</p>
    );
  }

  return (
    <div className="grid w-full grid-cols-1 gap-6 md:grid-cols-2">
      {matches.slice(0, 4).map((match) => {
        const sets = (match.sets as { set_number: number; score_a: number; score_b: number }[]) ?? [];
        const current = sets[sets.length - 1];
        return (
          <div key={match.id} className="rounded-2xl bg-gray-800 p-6">
            <p className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-400">
              Court {match.court} · {match.round_name}
            </p>
            <div className="flex items-center justify-between gap-4">
              <p className="flex-1 text-2xl font-bold">{match.entry_a_id ?? 'TBD'}</p>
              <div className="text-center font-mono">
                <p className="text-6xl font-black tabular-nums text-white">
                  {current?.score_a ?? 0}
                  <span className="mx-2 text-gray-500">:</span>
                  {current?.score_b ?? 0}
                </p>
              </div>
              <p className="flex-1 text-right text-2xl font-bold">{match.entry_b_id ?? 'TBD'}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function UpcomingMatchesSlide({ tournamentId }: { tournamentId: string }) {
  const [matches, setMatches] = useState<Database['public']['Tables']['matches']['Row'][]>([]);
  const supabase = createClient();

  useEffect(() => {
    supabase
      .from('matches')
      .select('*')
      .eq('tournament_id', tournamentId)
      .eq('status', 'scheduled')
      .order('scheduled_time')
      .limit(8)
      .then(({ data }) => setMatches(data ?? []));
  }, [tournamentId, supabase]);

  return (
    <div className="w-full space-y-3">
      {matches.map((match) => (
        <div key={match.id} className="flex items-center gap-4 rounded-xl bg-gray-800 px-6 py-4">
          <p className="w-16 text-center text-sm font-mono text-gray-400">
            {match.scheduled_time
              ? new Date(match.scheduled_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : '--:--'}
          </p>
          <p className="w-20 text-center text-sm font-semibold">Court {match.court}</p>
          <p className="flex-1 text-lg font-semibold">
            {match.entry_a_id ?? 'TBD'} <span className="text-gray-500">vs</span> {match.entry_b_id ?? 'TBD'}
          </p>
          <p className="text-sm text-gray-400">{match.round_name}</p>
        </div>
      ))}
      {matches.length === 0 && (
        <p className="text-center text-4xl font-semibold text-gray-500">No upcoming matches</p>
      )}
    </div>
  );
}

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

  if (!announcement) return <p className="text-4xl font-semibold text-gray-500">No active announcement</p>;

  const isUrgent = announcement.urgency === 'urgent';

  return (
    <div className={`w-full max-w-4xl rounded-3xl p-12 text-center ${isUrgent ? 'bg-red-900 ring-4 ring-red-500' : 'bg-gray-800'}`}>
      {isUrgent && <p className="mb-4 text-lg font-bold uppercase tracking-widest text-red-300">Urgent</p>}
      <p className="text-5xl font-bold leading-tight">{announcement.message}</p>
      <p className="mt-6 text-sm text-gray-400">
        {new Date(announcement.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </p>
    </div>
  );
}

function BottomBar({ slideNumber, totalSlides, nextSlide }: {
  slideNumber: number;
  totalSlides: number;
  nextSlide: string;
}) {
  return (
    <div className="flex items-center justify-between bg-gray-900 px-8 py-3">
      <p className="text-xs text-gray-500">{slideNumber} / {totalSlides}</p>
      <p className="text-xs text-gray-500">Up next: {nextSlide}</p>
    </div>
  );
}
