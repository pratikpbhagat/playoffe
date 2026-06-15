'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { DisplaySlide, DisplayState, Announcement } from '@pickleball/shared';

interface MatchRow {
  id: string; status: string; court: number | null; round: number;
  round_name: string | null; group_name: string | null; category_id: string;
  entry_a_id: string | null; entry_b_id: string | null; winner_entry_id: string | null;
  serving_entry_id: string | null; server_number: number | null;
  sets: unknown; scheduled_time: string | null; started_at: string | null;
  completed_at: string | null; bracket_position: number | null; bracket_type: string | null;
}

interface CategoryRow {
  id: string; name: string; play_format: string; draw_format: string; status: string;
  winner_entry_id: string | null; runner_up_entry_id: string | null; third_place_entry_id: string | null;
  advance_per_group: number;
  scoring_format: string; // 'rally' | 'traditional'
}

interface EntryPlayer { entryId: string; playerName: string; partnerName: string | null; }
interface SetScore { set_number: number; score_a: number; score_b: number; }
interface StandingRow {
  entryId: string;
  played: number;
  wins: number;
  losses: number;
  setsFor: number;
  setsAgainst: number;
  pointDiff: number;
  /** Total individual match points scored across all sets */
  pointsFor: number;
  /** Total individual match points conceded across all sets */
  pointsAgainst: number;
}

interface TournamentWithClub {
  id: string;
  name: string;
  display_code: string;
  clubs: { name: string; logo_url: string | null; brand_primary_color: string | null } | null;
}
interface Props { tournament: TournamentWithClub; initialDisplayState: DisplayState; }

const SLIDE_LABELS: Record<DisplaySlide, string> = {
  live_scores: 'Live Scores', group_standings: 'Group Standings', live_bracket: 'Live Bracket',
  upcoming_matches: 'Upcoming', full_schedule: 'Full Schedule', category_podium: 'Podium',
  announcement: 'Announcement', wrap_up: 'Wrap-Up',
};

const DEFAULT_ROTATION: DisplaySlide[] = ['live_scores','upcoming_matches','group_standings','live_bracket','full_schedule'];

export function DisplayScreen({ tournament, initialDisplayState }: Props) {
  const supabase = createClient();
  const [displayState, setDisplayState] = useState<DisplayState>(initialDisplayState);
  const [rotationIndex, setRotationIndex] = useState(0);
  const [isConnected, setIsConnected] = useState(true);
  const [clock, setClock] = useState(new Date());
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [entryPlayers, setEntryPlayers] = useState<Map<string, EntryPlayer>>(new Map());
  const [activeAnnouncement, setActiveAnnouncement] = useState<Announcement | null>(null);
  const rotationRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    const [matchesRes, categoriesRes] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).from('matches')
        .select('id,status,court,round,round_name,group_name,category_id,entry_a_id,entry_b_id,winner_entry_id,serving_entry_id,server_number,sets,scheduled_time,started_at,completed_at,bracket_position,bracket_type')
        .eq('tournament_id', tournament.id).order('scheduled_time', { ascending: true }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).from('tournament_categories')
        .select('id,name,play_format,draw_format,status,winner_entry_id,runner_up_entry_id,third_place_entry_id,advance_per_group,scoring_format')
        .eq('tournament_id', tournament.id),
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fetchedMatches = ((matchesRes as any).data ?? []) as MatchRow[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fetchedCategories = ((categoriesRes as any).data ?? []) as CategoryRow[];
    setMatches(fetchedMatches);
    setCategories(fetchedCategories);
    const entryIds = new Set<string>();
    for (const m of fetchedMatches) { if (m.entry_a_id) entryIds.add(m.entry_a_id); if (m.entry_b_id) entryIds.add(m.entry_b_id); }
    for (const c of fetchedCategories) { if (c.winner_entry_id) entryIds.add(c.winner_entry_id); if (c.runner_up_entry_id) entryIds.add(c.runner_up_entry_id); if (c.third_place_entry_id) entryIds.add(c.third_place_entry_id); }
    if (entryIds.size > 0) {
      const { data: entries } = await supabase.from('tournament_entries').select('id,player_id,partner_id,players!player_id(full_name)').in('id', [...entryIds]);
      const partnerIds = (entries ?? []).map((e) => e.partner_id).filter((x): x is string => x != null);
      let partnerMap = new Map<string, string>();
      if (partnerIds.length > 0) { const { data: p } = await supabase.from('players').select('id,full_name').in('id', partnerIds); partnerMap = new Map((p ?? []).map((x) => [x.id, x.full_name])); }
      const map = new Map<string, EntryPlayer>();
      for (const e of entries ?? []) { const pn = (e.players as { full_name: string } | null)?.full_name ?? 'Unknown'; const ptn = e.partner_id ? (partnerMap.get(e.partner_id) ?? null) : null; map.set(e.id, { entryId: e.id, playerName: pn, partnerName: ptn }); }
      setEntryPlayers(map);
    }
    const ds = await supabase.from('display_state').select('active_announcement_id').eq('tournament_id', tournament.id).single();
    if (ds.data?.active_announcement_id) { const { data: ann } = await supabase.from('announcements').select('*').eq('id', ds.data.active_announcement_id).single(); setActiveAnnouncement(ann as Announcement | null); }
    else setActiveAnnouncement(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournament.id]);

  useEffect(() => { void fetchData(); }, [fetchData]);
  useEffect(() => { const t = setInterval(() => setClock(new Date()), 1000); return () => clearInterval(t); }, []);

  useEffect(() => {
    const ch = supabase.channel('display:' + tournament.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'display_state', filter: 'tournament_id=eq.' + tournament.id },
        (p) => { if (p.new) { setDisplayState(p.new as DisplayState); void fetchData(); } })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches', filter: 'tournament_id=eq.' + tournament.id }, () => { void fetchData(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements', filter: 'tournament_id=eq.' + tournament.id }, () => { void fetchData(); })
      .subscribe((s) => setIsConnected(s === 'SUBSCRIBED'));
    return () => { void supabase.removeChannel(ch); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournament.id]);

  // Slides active in the rotation — falls back to the default 5 if the DB
  // column hasn't been populated yet (e.g. before migration runs locally).
  // Declared before the rotation effects so they can reference rotationSlides.length.
  const rotationSlides: DisplaySlide[] =
    Array.isArray(displayState.enabled_slides) && displayState.enabled_slides.length > 0
      ? (displayState.enabled_slides as DisplaySlide[])
      : DEFAULT_ROTATION;

  // Reset to slide 0 whenever the enabled-slides list itself changes.
  const enabledSlidesKey = rotationSlides.join(',');
  useEffect(() => { setRotationIndex(0); }, [enabledSlidesKey]);

  useEffect(() => {
    if (rotationRef.current) clearInterval(rotationRef.current);
    if (!displayState.is_pinned && !displayState.is_paused) {
      const ms = (displayState.rotation_interval_secs ?? 20) * 1000;
      const len = rotationSlides.length || 1;
      rotationRef.current = setInterval(() => setRotationIndex((i) => (i + 1) % len), ms);
    }
    return () => { if (rotationRef.current) clearInterval(rotationRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayState.is_pinned, displayState.is_paused, displayState.rotation_interval_secs, rotationSlides.length, enabledSlidesKey]);

  const safeIndex = rotationSlides.length > 0 ? rotationIndex % rotationSlides.length : 0;
  const effectiveSlide: DisplaySlide = displayState.is_pinned ? displayState.current_slide : (rotationSlides[safeIndex] ?? 'live_scores');
  const entryLabel = useCallback((id: string | null): string => { if (!id) return 'TBD'; const ep = entryPlayers.get(id); if (!ep) return '—'; return ep.partnerName ? ep.playerName + ' / ' + ep.partnerName : ep.playerName; }, [entryPlayers]);
  const formatTime = (s: string | null): string => { if (!s) return '—'; return new Date(s).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: true }); };
  const parseSets = (s: unknown): SetScore[] => Array.isArray(s) ? s as SetScore[] : [];
  const catName = (id: string) => categories.find((c) => c.id === id)?.name ?? '';
  const liveMatches = matches.filter((m) => m.status === 'in_progress');
  const upcomingMatches = matches.filter((m) => m.status === 'scheduled');
  const completedMatches = matches.filter((m) => m.status === 'completed');
  const nextSlide: DisplaySlide = rotationSlides[(safeIndex + 1) % rotationSlides.length] ?? 'live_scores';

  const renderSlide = () => {
    switch (effectiveSlide) {
      case 'live_scores': return <LiveScoresSlide matches={liveMatches} categories={categories} entryLabel={entryLabel} entryPlayers={entryPlayers} parseSets={parseSets} catName={catName} />;
      case 'group_standings': return <GroupStandingsSlide matches={completedMatches} categories={categories} entryLabel={entryLabel} categoryFilter={displayState.active_category_filter} />;
      case 'live_bracket': return <LiveBracketSlide matches={matches} categories={categories} entryLabel={entryLabel} entryPlayers={entryPlayers} categoryFilter={displayState.active_category_filter} />;
      case 'upcoming_matches': return <UpcomingMatchesSlide matches={upcomingMatches} entryLabel={entryLabel} entryPlayers={entryPlayers} formatTime={formatTime} catName={catName} />;
      case 'full_schedule': return <FullScheduleSlide matches={matches} entryLabel={entryLabel} formatTime={formatTime} catName={catName} />;
      case 'category_podium': return <CategoryPodiumSlide categories={categories} entryLabel={entryLabel} categoryFilter={displayState.active_category_filter} />;
      case 'announcement': return <AnnouncementSlide announcement={activeAnnouncement} tournamentName={tournament.name} />;
      case 'wrap_up': return <WrapUpSlide categories={categories} entryLabel={entryLabel} tournamentName={tournament.name} />;
      default: return <LiveScoresSlide matches={liveMatches} categories={categories} entryLabel={entryLabel} entryPlayers={entryPlayers} parseSets={parseSets} catName={catName} />;
    }
  };

  return (
    <div className="fixed inset-0 bg-black overflow-hidden" style={{ fontFamily: 'system-ui, sans-serif' }}>
      <div className="absolute inset-x-0 top-0 flex items-center justify-between px-[3vw]"
        style={{ height: '7vh', background: 'linear-gradient(to right, #0f172a, #1e293b)', borderBottom: '1px solid #334155' }}>
        <div className="flex items-center gap-[2vw]">
          <span style={{ fontSize: '2.2vw', fontWeight: 900, color: '#ffffff' }}>{tournament.clubs?.name ?? 'PLAYOFFE'}</span>
          <span style={{ fontSize: '1.8vw', fontWeight: 600, color: '#94a3b8' }}>{tournament.name}</span>
        </div>
        <div className="flex items-center gap-[2vw]">
          <span style={{ fontSize: '1.4vw', fontWeight: 700, color: '#64748b', background: '#1e293b', borderRadius: '0.4vw', padding: '0.3vh 1vw', border: '1px solid #334155' }}>{SLIDE_LABELS[effectiveSlide]}</span>
          <span style={{ fontSize: '2vw', fontWeight: 700, color: '#ffffff', fontVariantNumeric: 'tabular-nums' }}>{clock.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: true })}</span>
        </div>
      </div>
      <div className="absolute inset-x-0 overflow-hidden" style={{ top: '7vh', bottom: '5vh' }}>{renderSlide()}</div>
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between px-[3vw]"
        style={{ height: '5vh', background: '#0f172a', borderTop: '1px solid #1e293b' }}>
        <div className="flex items-center gap-[0.8vw]">
          {rotationSlides.map((s) => <div key={s} style={{ width: effectiveSlide === s ? '2vw' : '0.8vw', height: '0.5vh', borderRadius: '9999px', background: effectiveSlide === s ? '#6366f1' : '#334155', transition: 'all 0.3s ease' }} />)}
        </div>
        {displayState.is_pinned ? <span style={{ fontSize: '1.1vw', color: '#6366f1' }}>Pinned</span> : <span style={{ fontSize: '1.1vw', color: '#475569' }}>Next: {SLIDE_LABELS[nextSlide]}</span>}
        <span style={{ fontSize: '1vw', color: '#334155' }}>PLAYOFFE</span>
      </div>
      {!isConnected && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)', zIndex: 50 }}>
          <div style={{ background: '#1e293b', border: '1px solid #475569', borderRadius: '1vw', padding: '3vh 4vw', textAlign: 'center' }}>
            <p style={{ fontSize: '2vw', color: '#f59e0b', fontWeight: 700 }}>Reconnecting...</p>
            <p style={{ fontSize: '1.4vw', color: '#64748b', marginTop: '1vh' }}>Live updates paused</p>
          </div>
        </div>
      )}
    </div>
  );
}

function EmptySlide({ icon, title, subtitle }: { icon: string; title: string; subtitle: string }) {
  return (
    <div className="h-full flex flex-col items-center justify-center" style={{ gap: '2vh' }}>
      <p style={{ fontSize: '6vw' }}>{icon}</p>
      <p style={{ fontSize: '2.5vw', fontWeight: 700, color: '#475569' }}>{title}</p>
      <p style={{ fontSize: '1.5vw', color: '#334155' }}>{subtitle}</p>
    </div>
  );
}

// ── Auto-paging hook ────────────────────────────────────────────────────────
// Cycles through pages automatically; resets to page 0 whenever item count changes.
function useAutoPage<T>(items: T[], pageSize: number, intervalMs = 5000) {
  const [pageNum, setPageNum] = useState(0);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  useEffect(() => { setPageNum(0); }, [items.length]);
  useEffect(() => {
    if (totalPages <= 1) return;
    const t = setInterval(() => setPageNum((p) => (p + 1) % totalPages), intervalMs);
    return () => clearInterval(t);
  }, [totalPages, intervalMs]);
  const page = items.slice(pageNum * pageSize, (pageNum + 1) * pageSize);
  return { page, pageNum, totalPages };
}

function PageIndicator({ pageNum, totalPages }: { pageNum: number; totalPages: number }) {
  if (totalPages <= 1) return null;
  return (
    <div style={{ position: 'absolute', bottom: '1.5vh', right: '2.5vw', display: 'flex', alignItems: 'center', gap: '0.4vw' }}>
      {Array.from({ length: totalPages }, (_, i) => (
        <div key={i} style={{ width: i === pageNum ? '1.4vw' : '0.5vw', height: '0.35vh', borderRadius: '9999px', background: i === pageNum ? '#6366f1' : '#334155', transition: 'all 0.3s ease' }} />
      ))}
      <span style={{ fontSize: '0.9vw', color: '#475569', marginLeft: '0.5vw' }}>{pageNum + 1}/{totalPages}</span>
    </div>
  );
}

function PlayerNameCell({ id, isWinner = false, entryPlayers, fontSize = '2vw', minHeight = '5vh', color, maxWidth = '65%', flex }: {
  id: string | null; isWinner?: boolean; entryPlayers: Map<string, EntryPlayer>;
  fontSize?: string; minHeight?: string; color?: string; maxWidth?: string; flex?: string | number;
}) {
  const resolvedColor = color ?? (isWinner ? '#a5f3fc' : '#94a3b8');
  const ep = id ? entryPlayers.get(id) : null;
  const nameStyle: React.CSSProperties = { fontSize, fontWeight: 600, color: resolvedColor, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.25 };
  return (
    /* minHeight locks all rows (singles & doubles) to the same height so
       dividers, score columns and "vs" labels stay vertically aligned */
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight, maxWidth, overflow: 'hidden', gap: '0.15vh', ...(flex !== undefined ? { flex } : {}) }}>
      <span style={nameStyle}>{ep ? ep.playerName : (id ? '—' : 'TBD')}</span>
      {ep?.partnerName && <span style={nameStyle}>{ep.partnerName}</span>}
    </div>
  );
}

function LiveScoresSlide({ matches, categories, entryLabel, entryPlayers, parseSets, catName }: {
  matches: MatchRow[]; categories: CategoryRow[]; entryLabel: (id: string | null) => string;
  entryPlayers: Map<string, EntryPlayer>;
  parseSets: (s: unknown) => SetScore[]; catName: (id: string) => string;
}) {
  if (matches.length === 0) return <EmptySlide icon="🎯" title="No live matches" subtitle="Matches will appear here when in progress" />;
  return (
    <div className="h-full px-[3vw] py-[2vh] overflow-hidden">
      <div className="grid h-full gap-[2vw]" style={{ gridTemplateColumns: matches.length === 1 ? '1fr' : 'repeat(2, 1fr)' }}>
        {matches.slice(0, 4).map((m) => {
          const sets = parseSets(m.sets);
          const aWins = sets.filter((s) => s.score_a > s.score_b).length;
          const bWins = sets.filter((s) => s.score_b > s.score_a).length;
          const cat = categories.find((c) => c.id === m.category_id);
          const isTraditional = (cat?.scoring_format ?? 'rally') === 'traditional';
          // For traditional: announcement-format score from serving team's perspective
          const servingIsA = m.serving_entry_id === m.entry_a_id;
          const latestSet = sets[sets.length - 1];
          const servingScore = latestSet ? (servingIsA ? latestSet.score_a : latestSet.score_b) : 0;
          const receivingScore = latestSet ? (servingIsA ? latestSet.score_b : latestSet.score_a) : 0;
          return (
            <div key={m.id} style={{ background: 'linear-gradient(135deg,#1e293b,#0f172a)', border: '1px solid #334155', borderRadius: '1.5vw', padding: '2.5vh 2.5vw', display: 'flex', flexDirection: 'column', gap: '1.5vh' }}>
              <div className="flex items-center justify-between">
                <span style={{ fontSize: '1.4vw', fontWeight: 700, color: '#6366f1', background: '#312e81', borderRadius: '0.4vw', padding: '0.2vh 0.8vw' }}>{m.court != null ? 'Court ' + m.court : 'Live'}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1vw' }}>
                  {/* Traditional: show X-Y-Z announcement format */}
                  {isTraditional && m.serving_entry_id && m.server_number != null && (
                    <span style={{ fontSize: '1.4vw', fontWeight: 800, color: '#f59e0b', background: 'rgba(245,158,11,0.12)', borderRadius: '0.4vw', padding: '0.2vh 0.8vw', letterSpacing: '0.04em', fontVariantNumeric: 'tabular-nums' }}>
                      {servingScore}–{receivingScore}–{m.server_number}
                    </span>
                  )}
                  <span style={{ fontSize: '1.2vw', color: '#64748b' }}>{catName(m.category_id)} · {m.round_name ?? 'R' + m.round}</span>
                </div>
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1.5vh' }}>
                {/* Team A row */}
                <div className="flex items-center justify-between">
                  <div style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
                    <PlayerNameCell id={m.entry_a_id} isWinner={aWins > bWins} entryPlayers={entryPlayers} />
                    {/* Serving dot — always same width so names never shift */}
                    <span title={m.serving_entry_id === m.entry_a_id ? 'Serving' : undefined} style={{ marginLeft: '0.6vw', flexShrink: 0, width: '0.75vw', height: '0.75vw', borderRadius: '50%', background: m.serving_entry_id === m.entry_a_id ? '#f59e0b' : 'transparent', boxShadow: m.serving_entry_id === m.entry_a_id ? '0 0 0.4vw rgba(245,158,11,0.5)' : 'none' }} />
                    {/* S1/S2 badge — traditional only, right of dot */}
                    {isTraditional && m.serving_entry_id === m.entry_a_id && m.server_number != null && (
                      <span style={{ marginLeft: '0.4vw', fontSize: '0.9vw', fontWeight: 700, color: '#f59e0b', background: 'rgba(245,158,11,0.15)', borderRadius: '0.3vw', padding: '0.1vh 0.4vw', flexShrink: 0 }}>
                        S{m.server_number}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-[1vw]">
                    {sets.map((s, i) => <span key={i} style={{ fontSize: '2.5vw', fontWeight: 700, color: s.score_a > s.score_b ? '#ffffff' : '#64748b', minWidth: '2vw', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{s.score_a}</span>)}
                    <span style={{ fontSize: '3.5vw', fontWeight: 900, color: aWins > bWins ? '#6366f1' : '#1e293b', minWidth: '3vw', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{aWins}</span>
                  </div>
                </div>
                <div style={{ height: '1px', background: '#1e293b' }} />
                {/* Team B row */}
                <div className="flex items-center justify-between">
                  <div style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
                    <PlayerNameCell id={m.entry_b_id} isWinner={bWins > aWins} entryPlayers={entryPlayers} />
                    <span title={m.serving_entry_id === m.entry_b_id ? 'Serving' : undefined} style={{ marginLeft: '0.6vw', flexShrink: 0, width: '0.75vw', height: '0.75vw', borderRadius: '50%', background: m.serving_entry_id === m.entry_b_id ? '#f59e0b' : 'transparent', boxShadow: m.serving_entry_id === m.entry_b_id ? '0 0 0.4vw rgba(245,158,11,0.5)' : 'none' }} />
                    {isTraditional && m.serving_entry_id === m.entry_b_id && m.server_number != null && (
                      <span style={{ marginLeft: '0.4vw', fontSize: '0.9vw', fontWeight: 700, color: '#f59e0b', background: 'rgba(245,158,11,0.15)', borderRadius: '0.3vw', padding: '0.1vh 0.4vw', flexShrink: 0 }}>
                        S{m.server_number}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-[1vw]">
                    {sets.map((s, i) => <span key={i} style={{ fontSize: '2.5vw', fontWeight: 700, color: s.score_b > s.score_a ? '#ffffff' : '#64748b', minWidth: '2vw', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{s.score_b}</span>)}
                    <span style={{ fontSize: '3.5vw', fontWeight: 900, color: bWins > aWins ? '#6366f1' : '#1e293b', minWidth: '3vw', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{bWins}</span>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5vw', fontSize: '1.2vw', color: '#f87171', fontWeight: 700 }}>
                <span style={{ display: 'inline-block', width: '0.7vw', height: '0.7vw', borderRadius: '50%', background: '#ef4444' }} />
                LIVE
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function UpcomingMatchesSlide({ matches, entryLabel, entryPlayers, formatTime, catName }: {
  matches: MatchRow[]; entryLabel: (id: string | null) => string;
  entryPlayers: Map<string, EntryPlayer>;
  formatTime: (s: string | null) => string; catName: (id: string) => string;
}) {
  const { page, pageNum, totalPages } = useAutoPage(matches, 8);
  if (matches.length === 0) return <EmptySlide icon="📅" title="No upcoming matches" subtitle="All matches may already be in progress or completed" />;
  return (
    <div className="h-full px-[3vw] py-[2vh] overflow-hidden" style={{ position: 'relative' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2vh' }}>
        {page.map((m, i) => (
          // minHeight: 7.5vh ensures every row — singles (1 line) or doubles (2 lines) —
          // occupies the same vertical space. alignItems: center keeps all left-side
          // meta text and the "vs" label pinned to the vertical midpoint of the row.
          <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '2vw', background: i % 2 === 0 ? '#0f172a' : '#1e293b', border: '1px solid #1e293b', borderRadius: '0.8vw', padding: '0 2vw', minHeight: '7.5vh' }}>
            <span style={{ fontSize: '1.6vw', fontWeight: 700, color: '#6366f1', minWidth: '8vw', flexShrink: 0 }}>{formatTime(m.scheduled_time)}</span>
            {m.court != null && <span style={{ fontSize: '1.3vw', color: '#64748b', minWidth: '6vw', flexShrink: 0 }}>Court {m.court}</span>}
            {/* Two-line stacked cell: category name wraps freely, round shown below */}
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: '14vw', maxWidth: '28vw', flexShrink: 0, gap: '0.2vh' }}>
              <span style={{ fontSize: '1.25vw', color: '#475569', lineHeight: 1.3 }}>{catName(m.category_id)}</span>
              <span style={{ fontSize: '1.1vw', color: '#334155', lineHeight: 1.3, whiteSpace: 'nowrap' }}>{m.round_name ?? 'Round ' + m.round}</span>
            </div>
            {/* flex: 1 + no overflow:hidden lets both name cells expand equally and
                show their full stacked height without being clipped */}
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '1.5vw', minWidth: 0 }}>
              <PlayerNameCell id={m.entry_a_id} entryPlayers={entryPlayers} fontSize="1.8vw" minHeight="3.2vh" color="#e2e8f0" maxWidth="none" flex={1} />
              <span style={{ fontSize: '1.4vw', color: '#475569', fontWeight: 700, flexShrink: 0 }}>vs</span>
              <PlayerNameCell id={m.entry_b_id} entryPlayers={entryPlayers} fontSize="1.8vw" minHeight="3.2vh" color="#e2e8f0" maxWidth="none" flex={1} />
            </div>
          </div>
        ))}
      </div>
      <PageIndicator pageNum={pageNum} totalPages={totalPages} />
    </div>
  );
}

function FullScheduleSlide({ matches, entryLabel, formatTime, catName }: {
  matches: MatchRow[]; entryLabel: (id: string | null) => string;
  formatTime: (s: string | null) => string; catName: (id: string) => string;
}) {
  // Priority order: live first, then upcoming by time, then completed (most recent first)
  const sorted = [
    ...matches.filter((m) => m.status === 'in_progress'),
    ...matches.filter((m) => m.status === 'scheduled'),
    ...[...matches.filter((m) => m.status === 'completed')].reverse(),
  ];
  const { page, pageNum, totalPages } = useAutoPage(sorted, 12);
  const SC: Record<string, string> = { completed: '#22c55e', in_progress: '#6366f1', scheduled: '#334155' };
  if (sorted.length === 0) return <EmptySlide icon="📋" title="No matches scheduled" subtitle="Matches will appear here once the draw is generated" />;
  return (
    <div className="h-full px-[3vw] py-[2vh] overflow-hidden" style={{ position: 'relative' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8vh' }}>
        {page.map((m, i) => (
          <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '1.5vw', background: m.status === 'in_progress' ? 'rgba(99,102,241,0.08)' : i % 2 === 0 ? '#0f172a' : '#111827', borderRadius: '0.5vw', padding: '0.8vh 1.5vw', border: m.status === 'in_progress' ? '1px solid rgba(99,102,241,0.3)' : '1px solid transparent' }}>
            <span style={{ width: '0.4vw', height: '3vh', borderRadius: '9999px', background: SC[m.status] ?? '#334155', flexShrink: 0 }} />
            <span style={{ fontSize: '1.2vw', color: '#64748b', minWidth: '7vw', fontVariantNumeric: 'tabular-nums' }}>{formatTime(m.scheduled_time)}</span>
            <span style={{ fontSize: '1.2vw', color: '#475569', minWidth: '5vw' }}>{m.court != null ? 'C' + m.court : '—'}</span>
            <span style={{ fontSize: '1.1vw', color: '#334155', minWidth: '9vw', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{catName(m.category_id)}</span>
            <span style={{ flex: 1, fontSize: '1.5vw', fontWeight: 500, color: '#cbd5e1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {entryLabel(m.entry_a_id)} <span style={{ color: '#334155' }}>vs</span> {entryLabel(m.entry_b_id)}
            </span>
            {m.status === 'in_progress' && <span style={{ fontSize: '1vw', color: '#6366f1', fontWeight: 700, flexShrink: 0 }}>● LIVE</span>}
            {m.status === 'completed' && m.winner_entry_id && <span style={{ fontSize: '1.1vw', color: '#22c55e', fontWeight: 700, flexShrink: 0 }}>✓ {entryLabel(m.winner_entry_id)}</span>}
          </div>
        ))}
      </div>
      <PageIndicator pageNum={pageNum} totalPages={totalPages} />
    </div>
  );
}

function GroupStandingsSlide({ matches, categories, entryLabel, categoryFilter }: {
  matches: MatchRow[]; categories: CategoryRow[];
  entryLabel: (id: string | null) => string; categoryFilter: string | null;
}) {
  const rrCats = categories.filter((c) => c.draw_format === 'round_robin' || c.draw_format === 'group_stage_knockout');
  const filtered = categoryFilter ? rrCats.filter((c) => c.id === categoryFilter) : rrCats;
  if (filtered.length === 0) return <EmptySlide icon="📊" title="No group standings" subtitle="Round-robin draws will appear here" />;

  // groupName = null → include all matches regardless of group (for round_robin)
  // groupName = "Group A" → only matches from that specific group
  const buildStandings = (catId: string, groupName: string | null): (StandingRow & { rank: number })[] => {
    const rowMap = new Map<string, StandingRow>();
    const ensure = (id: string) => {
      if (!rowMap.has(id)) rowMap.set(id, {
        entryId: id, played: 0, wins: 0, losses: 0,
        setsFor: 0, setsAgainst: 0, pointDiff: 0,
        pointsFor: 0, pointsAgainst: 0,
      });
      return rowMap.get(id)!;
    };
    const catMatches = matches.filter(
      (m) => m.category_id === catId &&
             m.status === 'completed' &&
             (groupName === null || m.group_name === groupName),
    );
    for (const m of catMatches) {
      if (!m.entry_a_id || !m.entry_b_id) continue;
      const a = ensure(m.entry_a_id); const b = ensure(m.entry_b_id);
      for (const s of (Array.isArray(m.sets) ? m.sets : []) as SetScore[]) {
        if (s.score_a > s.score_b) { a.setsFor++; b.setsAgainst++; } else { b.setsFor++; a.setsAgainst++; }
        a.pointDiff += s.score_a - s.score_b; b.pointDiff += s.score_b - s.score_a;
        a.pointsFor += s.score_a;  a.pointsAgainst += s.score_b;
        b.pointsFor += s.score_b;  b.pointsAgainst += s.score_a;
      }
      a.played++; b.played++;
      if (m.winner_entry_id === m.entry_a_id) { a.wins++; b.losses++; } else { b.wins++; a.losses++; }
    }
    return [...rowMap.values()]
      .sort((a, b) => b.wins - a.wins || b.pointDiff - a.pointDiff || (b.pointsFor - b.pointsAgainst) - (a.pointsFor - a.pointsAgainst))
      .map((r, i) => ({ ...r, rank: i + 1 }));
  };

  // Build panels — group_stage_knockout gets one panel per group;
  // round_robin gets one panel per category (or paginated if many entries).
  const PAGE_ROWS = 8;
  const panels = filtered.flatMap((cat) => {
    const isGroupStage = cat.draw_format === 'group_stage_knockout';

    if (isGroupStage) {
      // Collect sorted unique group names from completed group-stage matches
      const groupNames = [...new Set(
        matches
          .filter((m) => m.category_id === cat.id && m.group_name)
          .map((m) => m.group_name!),
      )].sort();

      if (groupNames.length === 0) {
        // Draw not generated yet — show empty panel
        return [{ id: cat.id, cat, groupName: null as string | null, catSubtitle: null as string | null, rows: [] as (StandingRow & { rank: number })[], chunkLabel: '' }];
      }

      return groupNames.flatMap((groupName) => {
        const standings = buildStandings(cat.id, groupName);
        const chunks = Math.max(1, Math.ceil(standings.length / PAGE_ROWS));
        return Array.from({ length: chunks }, (_, p) => ({
          id: `${cat.id}-${groupName}-${p}`,
          cat,
          groupName,
          catSubtitle: cat.name,
          rows: standings.slice(p * PAGE_ROWS, (p + 1) * PAGE_ROWS),
          chunkLabel: chunks > 1 ? `${p + 1}/${chunks}` : '',
        }));
      });
    }

    // round_robin — single standings table per category
    const standings = buildStandings(cat.id, null);
    const chunks = Math.max(1, Math.ceil(standings.length / PAGE_ROWS));
    return Array.from({ length: chunks }, (_, p) => ({
      id: `${cat.id}-${p}`,
      cat,
      groupName: null as string | null,
      catSubtitle: null as string | null,
      rows: standings.slice(p * PAGE_ROWS, (p + 1) * PAGE_ROWS),
      chunkLabel: chunks > 1 ? `${p + 1}/${chunks}` : '',
    }));
  });

  const { page: visible, pageNum, totalPages } = useAutoPage(panels, 2);

  return (
    <div className="h-full px-[3vw] py-[2vh] overflow-hidden" style={{ position: 'relative' }}>
      <div style={{ display: 'grid', gridTemplateColumns: visible.length === 1 ? '1fr' : 'repeat(2, 1fr)', gap: '2vw' }}>
        {visible.map((panel) => (
          <div key={panel.id} style={{ display: 'flex', flexDirection: 'column', gap: '1.2vh' }}>
            {/* Panel header */}
            <div style={{ marginBottom: '0.3vh' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.8vw' }}>
                <h2 style={{ fontSize: '1.8vw', fontWeight: 700, color: '#e2e8f0' }}>
                  {panel.groupName ?? panel.cat.name}
                </h2>
                {panel.chunkLabel && <span style={{ fontSize: '1vw', color: '#475569' }}>({panel.chunkLabel})</span>}
              </div>
              {/* Category name as subtitle for group panels */}
              {panel.catSubtitle && (
                <p style={{ fontSize: '1.1vw', color: '#475569', marginTop: '0.15vh' }}>{panel.catSubtitle}</p>
              )}
            </div>
            {/* Header — P W L | PS PL PD */}
            <div style={{ display: 'flex', gap: '0.6vw', fontSize: '1vw', color: '#475569', fontWeight: 700, padding: '0 0.8vw', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              <span style={{ minWidth: '2vw' }}>#</span>
              <span style={{ flex: 1 }}>Player</span>
              <span style={{ width: '2.6vw', textAlign: 'center' }}>P</span>
              <span style={{ width: '2.6vw', textAlign: 'center' }}>W</span>
              <span style={{ width: '2.6vw', textAlign: 'center' }}>L</span>
              <span style={{ width: '3.5vw', textAlign: 'center' }}>PS</span>
              <span style={{ width: '3.5vw', textAlign: 'center' }}>PL</span>
              <span style={{ width: '4vw',  textAlign: 'center' }}>PD</span>
            </div>
            {panel.rows.flatMap((row, i) => {
              const isGroupStage = panel.cat.draw_format === 'group_stage_knockout';
              const cutAt = isGroupStage ? (panel.cat.advance_per_group ?? 2) : null;
              const qualifies = cutAt !== null && row.rank <= cutAt;
              // Insert cut line between last qualifying and first non-qualifying row
              const showCutLine = cutAt !== null && row.rank === cutAt && i < panel.rows.length - 1;
              const pd = row.pointsFor - row.pointsAgainst;
              const pdColor = pd > 0 ? '#22c55e' : pd < 0 ? '#ef4444' : '#64748b';
              const rowEl = (
                <div key={row.entryId} style={{ display: 'flex', alignItems: 'center', gap: '0.6vw', padding: '0.85vh 0.8vw', background: qualifies ? 'rgba(34,197,94,0.12)' : row.rank % 2 === 0 ? '#0f172a' : '#1e293b', borderRadius: '0.5vw', border: qualifies ? '1px solid rgba(34,197,94,0.35)' : '1px solid transparent' }}>
                  <span style={{ fontSize: '1.2vw', color: qualifies ? '#4ade80' : '#475569', minWidth: '2vw', fontWeight: qualifies ? 700 : 400 }}>{row.rank}</span>
                  <span style={{ flex: 1, fontSize: '1.5vw', fontWeight: 600, color: qualifies ? '#f0fdf4' : '#cbd5e1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entryLabel(row.entryId)}</span>
                  <span style={{ width: '2.6vw', textAlign: 'center', fontSize: '1.3vw', color: '#64748b',  fontVariantNumeric: 'tabular-nums' }}>{row.played}</span>
                  <span style={{ width: '2.6vw', textAlign: 'center', fontSize: '1.3vw', fontWeight: 700, color: '#22c55e', fontVariantNumeric: 'tabular-nums' }}>{row.wins}</span>
                  <span style={{ width: '2.6vw', textAlign: 'center', fontSize: '1.3vw', color: '#ef4444', fontVariantNumeric: 'tabular-nums' }}>{row.losses}</span>
                  <span style={{ width: '3.5vw', textAlign: 'center', fontSize: '1.3vw', color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>{row.pointsFor}</span>
                  <span style={{ width: '3.5vw', textAlign: 'center', fontSize: '1.3vw', color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>{row.pointsAgainst}</span>
                  <span style={{ width: '4vw',  textAlign: 'center', fontSize: '1.3vw', fontWeight: 700, color: pdColor, fontVariantNumeric: 'tabular-nums' }}>
                    {pd > 0 ? `+${pd}` : pd}
                  </span>
                </div>
              );
              if (showCutLine) {
                return [
                  rowEl,
                  <div key={`cut-${row.entryId}`} style={{ height: '1px', background: 'rgba(34,197,94,0.3)', margin: '0.1vh 0', borderTop: '1px dashed rgba(34,197,94,0.4)' }} />,
                ];
              }
              return [rowEl];
            })}
          </div>
        ))}
      </div>
      <PageIndicator pageNum={pageNum} totalPages={totalPages} />
    </div>
  );
}

function LiveBracketSlide({ matches, categories, entryLabel, entryPlayers, categoryFilter }: {
  matches: MatchRow[]; categories: CategoryRow[];
  entryLabel: (id: string | null) => string;
  entryPlayers: Map<string, EntryPlayer>;
  categoryFilter: string | null;
}) {
  const elimCats = categories.filter((c) => c.draw_format === 'single_elimination' || c.draw_format === 'double_elimination' || c.draw_format === 'group_stage_knockout');
  const cat = categoryFilter ? (elimCats.find((c) => c.id === categoryFilter) ?? elimCats[0]) : elimCats[0];
  if (!cat) return <EmptySlide icon="🏆" title="No bracket available" subtitle="Elimination draws will appear here" />;

  const cm = matches
    .filter((m) => m.category_id === cat.id && m.bracket_type !== 'losers')
    .sort((a, b) => (a.bracket_position ?? 0) - (b.bracket_position ?? 0));
  const rounds = [...new Set(cm.map((m) => m.round))].sort((a, b) => a - b);

  // Find the earliest round that has live or upcoming matches — start display from there.
  const activeRound = rounds.find((r) =>
    cm.filter((m) => m.round === r).some((m) => m.status === 'in_progress' || m.status === 'scheduled'),
  ) ?? rounds[0];
  const activeIdx = activeRound != null ? rounds.indexOf(activeRound) : 0;
  // Re-order so the active round comes first; completed earlier rounds wrap to the end.
  const orderedRounds = [...rounds.slice(activeIdx), ...rounds.slice(0, activeIdx)];

  const { page: visibleRounds, pageNum, totalPages } = useAutoPage(orderedRounds, 3, 6000);

  return (
    <div className="h-full px-[2vw] py-[2vh] overflow-hidden" style={{ position: 'relative' }}>
      <h2 style={{ fontSize: '1.8vw', fontWeight: 700, color: '#e2e8f0', marginBottom: '1.5vh' }}>{cat.name} — Bracket</h2>
      <div style={{ display: 'flex', gap: '2vw', height: 'calc(100% - 5vh)' }}>
        {visibleRounds.map((round) => {
          const rm = cm.filter((m) => m.round === round);
          const hasLive = rm.some((m) => m.status === 'in_progress');
          return (
            <div key={round} style={{ display: 'flex', flexDirection: 'column', gap: '1.5vh', flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: '1.2vw', fontWeight: 700, color: hasLive ? '#a5b4fc' : '#6366f1', textAlign: 'center', padding: '0.5vh', background: hasLive ? '#1e1b4b' : '#0f172a', borderRadius: '0.4vw', border: hasLive ? '1px solid #4f46e5' : '1px solid #1e293b' }}>
                {rm[0]?.round_name ?? 'Round ' + round}
                {hasLive && <span style={{ marginLeft: '0.5vw', color: '#ef4444' }}>●</span>}
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1vh', flex: 1, justifyContent: 'space-evenly' }}>
                {rm.map((m) => {
                  const aWon = m.winner_entry_id === m.entry_a_id;
                  const bWon = m.winner_entry_id === m.entry_b_id;
                  return (
                    <div key={m.id} style={{ background: '#0f172a', border: '1px solid ' + (m.status === 'in_progress' ? '#6366f1' : '#1e293b'), borderRadius: '0.6vw', overflow: 'hidden' }}>
                      {([{ id: m.entry_a_id, won: aWon }, { id: m.entry_b_id, won: bWon }] as const).map((p, i) => {
                        const ep = p.id ? entryPlayers.get(p.id) : null;
                        const nameColor = p.won ? '#ffffff' : m.winner_entry_id ? '#475569' : '#cbd5e1';
                        const nameStyle: React.CSSProperties = { fontSize: '1.4vw', fontWeight: p.won ? 700 : 500, color: nameColor, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3 };
                        return (
                          <div key={i} style={{ padding: '0.8vh 1vw', background: p.won ? 'rgba(99,102,241,0.2)' : 'transparent', borderBottom: i === 0 ? '1px solid #1e293b' : 'none', overflow: 'hidden', minHeight: '3.5vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '0.1vh' }}>
                            <span style={nameStyle}>{ep ? ep.playerName : (p.id ? '—' : 'TBD')}{p.won ? ' ✓' : ''}</span>
                            {ep?.partnerName && <span style={{ ...nameStyle, fontWeight: p.won ? 600 : 400 }}>{ep.partnerName}</span>}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <PageIndicator pageNum={pageNum} totalPages={totalPages} />
    </div>
  );
}

function CategoryPodiumSlide({ categories, entryLabel, categoryFilter }: {
  categories: CategoryRow[]; entryLabel: (id: string | null) => string; categoryFilter: string | null;
}) {
  const completed = categories.filter((c) => c.winner_entry_id);
  const toShow = categoryFilter ? completed.filter((c) => c.id === categoryFilter) : completed;
  if (toShow.length === 0) return <EmptySlide icon="🏅" title="No results yet" subtitle="Category winners will appear here after completion" />;
  return (
    <div className="h-full px-[3vw] py-[2vh] overflow-hidden">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(' + Math.min(toShow.length, 3) + ', 1fr)', gap: '2vw', height: '100%' }}>
        {toShow.slice(0, 3).map((cat) => (
          <div key={cat.id} style={{ background: 'linear-gradient(180deg,#1e1b4b,#0f172a)', border: '1px solid #312e81', borderRadius: '1.5vw', padding: '3vh 2.5vw', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2.5vh' }}>
            <h3 style={{ fontSize: '1.8vw', fontWeight: 700, color: '#a5b4fc', textAlign: 'center' }}>{cat.name}</h3>
            {[{ emoji: '🥇', label: 'Champion', entryId: cat.winner_entry_id, color: '#fbbf24' }, { emoji: '🥈', label: 'Runner-up', entryId: cat.runner_up_entry_id, color: '#94a3b8' }, { emoji: '🥉', label: '3rd Place', entryId: cat.third_place_entry_id, color: '#cd7c2e' }].map((pos, i) => pos.entryId ? (
              <div key={i} style={{ width: '100%', textAlign: 'center', padding: '1.5vh 1.5vw', background: i === 0 ? 'rgba(251,191,36,0.1)' : 'rgba(255,255,255,0.03)', borderRadius: '0.8vw', border: i === 0 ? '1px solid rgba(251,191,36,0.3)' : '1px solid transparent' }}>
                <span style={{ fontSize: '2.5vw' }}>{pos.emoji}</span>
                <p style={{ fontSize: i === 0 ? '2vw' : '1.6vw', fontWeight: 700, color: pos.color, marginTop: '0.5vh', lineHeight: 1.2 }}>{entryLabel(pos.entryId)}</p>
                <p style={{ fontSize: '1.1vw', color: '#475569', marginTop: '0.3vh' }}>{pos.label}</p>
              </div>
            ) : null)}
          </div>
        ))}
      </div>
    </div>
  );
}

function AnnouncementSlide({ announcement, tournamentName }: { announcement: Announcement | null; tournamentName: string }) {
  if (!announcement) return <EmptySlide icon="📢" title="Announcement" subtitle="No active announcement" />;
  const isUrgent = announcement.urgency === 'urgent';
  return (
    <div className="h-full flex flex-col items-center justify-center px-[8vw]" style={{ background: isUrgent ? 'radial-gradient(ellipse at center,rgba(239,68,68,0.15) 0%,transparent 70%)' : 'radial-gradient(ellipse at center,rgba(99,102,241,0.1) 0%,transparent 70%)' }}>
      <div style={{ fontSize: '5vw', marginBottom: '2vh' }}>{isUrgent ? '🚨' : '📢'}</div>
      {isUrgent && <div style={{ fontSize: '1.5vw', fontWeight: 700, color: '#ef4444', letterSpacing: '0.2em', marginBottom: '2vh', textTransform: 'uppercase' }}>URGENT ANNOUNCEMENT</div>}
      <p style={{ fontSize: '3.5vw', fontWeight: 700, color: isUrgent ? '#fca5a5' : '#e2e8f0', textAlign: 'center', lineHeight: 1.3, maxWidth: '80vw' }}>{announcement.message}</p>
      <p style={{ fontSize: '1.2vw', color: '#475569', marginTop: '4vh' }}>{tournamentName}</p>
    </div>
  );
}

function WrapUpSlide({ categories, entryLabel, tournamentName }: { categories: CategoryRow[]; entryLabel: (id: string | null) => string; tournamentName: string }) {
  const completed = categories.filter((c) => c.winner_entry_id);
  return (
    <div className="h-full flex flex-col items-center justify-center px-[4vw] py-[2vh]">
      <div style={{ textAlign: 'center', marginBottom: '3vh' }}>
        <p style={{ fontSize: '5vw', marginBottom: '1vh' }}>🏆</p>
        <h1 style={{ fontSize: '3vw', fontWeight: 900, color: '#ffffff' }}>Tournament Complete!</h1>
        <p style={{ fontSize: '1.6vw', color: '#64748b', marginTop: '0.5vh' }}>{tournamentName}</p>
      </div>
      {completed.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(' + Math.min(completed.length, 3) + ', 1fr)', gap: '2vw', width: '100%' }}>
          {completed.map((cat) => (
            <div key={cat.id} style={{ background: 'linear-gradient(135deg,#1e1b4b,#0f172a)', border: '1px solid #312e81', borderRadius: '1vw', padding: '2vh 2vw', textAlign: 'center' }}>
              <p style={{ fontSize: '1.3vw', color: '#6366f1', fontWeight: 700, marginBottom: '1vh' }}>{cat.name}</p>
              <p style={{ fontSize: '2vw', marginBottom: '0.5vh' }}>🥇</p>
              <p style={{ fontSize: '1.8vw', fontWeight: 700, color: '#fbbf24' }}>{entryLabel(cat.winner_entry_id)}</p>
              {cat.runner_up_entry_id && <p style={{ fontSize: '1.2vw', color: '#94a3b8', marginTop: '0.5vh' }}>Runner-up: {entryLabel(cat.runner_up_entry_id)}</p>}
            </div>
          ))}
        </div>
      ) : <p style={{ fontSize: '1.8vw', color: '#475569' }}>Results coming soon...</p>}
      <p style={{ fontSize: '1.3vw', color: '#334155', marginTop: '4vh' }}>Thanks for playing · powered by PLAYOFFE</p>
    </div>
  );
}
