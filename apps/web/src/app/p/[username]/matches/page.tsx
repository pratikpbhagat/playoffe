import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { AppNav } from '@/components/layout/AppNav';
import { getPlayerByUsername } from '@pickleball/db';

const PAGE_SIZE = 20;

const FORMAT_TABS = [
  { label: 'All', value: 'all' },
  { label: 'Singles', value: 'singles' },
  { label: 'Doubles', value: 'doubles' },
  { label: 'Mixed', value: 'mixed_doubles' },
] as const;

const RESULT_STYLE: Record<string, { label: string; bg: string; text: string }> = {
  win:           { label: 'W',   bg: 'bg-accent-500/10',   text: 'text-accent-400' },
  loss:          { label: 'L',   bg: 'bg-red-500/10',      text: 'text-red-400' },
  walkover_win:  { label: 'W/O', bg: 'bg-accent-500/10',   text: 'text-accent-400/70' },
  walkover_loss: { label: 'W/O', bg: 'bg-slate-700/30',    text: 'text-slate-500' },
};

const PLAY_FORMAT_LABEL: Record<string, string> = {
  singles: 'Singles',
  doubles: 'Doubles',
  mixed_doubles: 'Mixed',
};

interface Props {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ format?: string; page?: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  return { title: `Match history · @${username} · PLAYOFFE` };
}

export default async function MatchHistoryPage({ params, searchParams }: Props) {
  const { username } = await params;
  const { format = 'all', page: pageStr = '1' } = await searchParams;

  const page = Math.max(1, parseInt(pageStr) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const supabase = await createClient();
  const admin = createAdminClient();

  let player;
  try {
    player = await getPlayerByUsername(supabase, username);
  } catch {
    notFound();
  }

  // ── Fetch full match history with category + round info ─────────────────────

  const { data: rawHistory } = await admin
    .from('match_history')
    .select(`
      id, result, sets, rating_before, rating_after, rating_change,
      played_at, tournament_id, opponent_entry_id, match_id,
      m:matches!match_id(
        round_name, round,
        tc:tournament_categories!category_id(name, play_format)
      )
    `)
    .eq('player_id', player.id)
    .order('played_at', { ascending: false });

  type RawRow = {
    id: string;
    result: string;
    sets: unknown;
    rating_before: number;
    rating_after: number;
    rating_change: number;
    played_at: string;
    tournament_id: string;
    opponent_entry_id: string | null;
    match_id: string;
    m: { round_name: string | null; round: number; tc: { name: string; play_format: string } | null } | null;
  };

  const rows = (rawHistory ?? []) as unknown as RawRow[];

  // Apply format filter in TypeScript (all records loaded, realistic for any player)
  const filtered = format === 'all'
    ? rows
    : rows.filter((h) => h.m?.tc?.play_format === format);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageRows = filtered.slice(offset, offset + PAGE_SIZE);

  // ── Batch-fetch tournament names ────────────────────────────────────────────

  const tournamentIds = [...new Set(pageRows.map((h) => h.tournament_id))];
  let tournamentMap = new Map<string, string>();
  if (tournamentIds.length > 0) {
    const { data: tournaments } = await admin
      .from('tournaments')
      .select('id, name, slug')
      .in('id', tournamentIds);
    tournamentMap = new Map((tournaments ?? []).map((t) => [t.id, t.name]));
  }

  // ── Batch-fetch opponent names ───────────────────────────────────────────────

  const entryIds = pageRows.map((h) => h.opponent_entry_id).filter((id): id is string => id !== null);
  let opponentMap = new Map<string, string>();
  if (entryIds.length > 0) {
    const { data: entries } = await admin
      .from('tournament_entries')
      .select('id, players!player_id(full_name)')
      .in('id', entryIds);
    opponentMap = new Map(
      (entries ?? []).map((e) => [
        e.id,
        (e.players as { full_name: string } | null)?.full_name ?? 'Unknown',
      ]),
    );
  }

  // ── Build the page URL helper ────────────────────────────────────────────────

  function pageUrl(p: number, fmt: string = format) {
    const q = new URLSearchParams();
    if (fmt !== 'all') q.set('format', fmt);
    if (p > 1) q.set('page', String(p));
    const qs = q.toString();
    return `/p/${username}/matches${qs ? `?${qs}` : ''}`;
  }

  return (
    <div className="min-h-screen bg-surface">
      <AppNav />

      <main className="mx-auto max-w-3xl px-4 py-10">
        {/* Breadcrumb */}
        <nav className="mb-6 flex items-center gap-2 text-sm text-slate-500">
          <Link href={`/p/${username}`} className="hover:text-slate-300 transition-colors">
            {player.full_name}
          </Link>
          <span>/</span>
          <span className="text-slate-400">Match history</span>
        </nav>

        <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-white">Match history</h1>
            <p className="mt-1 text-sm text-slate-500">
              {total === 0
                ? 'No matches recorded yet'
                : `${total} match${total !== 1 ? 'es' : ''} · showing ${offset + 1}–${Math.min(offset + PAGE_SIZE, total)}`}
            </p>
          </div>
        </div>

        {/* Format tabs */}
        <div className="mb-6 flex gap-2 flex-wrap">
          {FORMAT_TABS.map((tab) => {
            const count = tab.value === 'all'
              ? rows.length
              : rows.filter((h) => h.m?.tc?.play_format === tab.value).length;
            const isActive = format === tab.value || (tab.value === 'all' && format === 'all');
            return (
              <Link
                key={tab.value}
                href={pageUrl(1, tab.value)}
                className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
                  isActive
                    ? 'bg-brand-600 text-white'
                    : 'border border-surface-border text-slate-400 hover:border-slate-500 hover:text-slate-300'
                }`}
              >
                {tab.label}
                {count > 0 && (
                  <span className={`ml-1.5 ${isActive ? 'text-brand-200' : 'text-slate-600'}`}>
                    {count}
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        {/* Match list */}
        {pageRows.length === 0 ? (
          <div className="rounded-xl bg-surface-card p-10 text-center ring-1 ring-surface-border">
            <p className="text-2xl mb-2">🎾</p>
            <p className="text-sm font-medium text-white mb-1">No matches found</p>
            <p className="text-xs text-slate-500">
              {format === 'all'
                ? 'No matches have been recorded yet.'
                : `No ${PLAY_FORMAT_LABEL[format] ?? format} matches recorded yet.`}
            </p>
          </div>
        ) : (
          <div className="rounded-xl bg-surface-card ring-1 ring-surface-border overflow-hidden">
            <div className="divide-y divide-surface-border">
              {pageRows.map((h) => {
                const style = RESULT_STYLE[h.result] ?? { label: h.result, bg: 'bg-slate-700/30', text: 'text-slate-400' };
                const sets = (h.sets as { set_number?: number; score_a: number; score_b: number }[]) ?? [];
                const scoreStr = sets.length > 0
                  ? sets.map((s) => `${s.score_a}-${s.score_b}`).join(', ')
                  : null;
                const delta = Number(h.rating_change);
                const deltaStr = delta > 0 ? `+${delta.toFixed(2)}` : delta.toFixed(2);
                const deltaColor = delta > 0 ? 'text-accent-400' : delta < 0 ? 'text-red-400' : 'text-slate-500';
                const opponentName = h.opponent_entry_id ? opponentMap.get(h.opponent_entry_id) : null;
                const tournamentName = tournamentMap.get(h.tournament_id);
                const cat = h.m?.tc;
                const roundLabel = h.m?.round_name ?? (h.m?.round ? `Round ${h.m.round}` : null);

                return (
                  <div key={h.id} className="flex items-center gap-4 px-5 py-3.5">
                    {/* Result badge */}
                    <span className={`shrink-0 w-9 rounded text-center px-1.5 py-0.5 text-xs font-bold ${style.bg} ${style.text}`}>
                      {style.label}
                    </span>

                    {/* Match info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">
                        {opponentName ? (
                          <>vs {opponentName}</>
                        ) : (
                          <span className="text-slate-500 italic">Opponent unknown</span>
                        )}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {cat && (
                          <span className="text-xs text-slate-600">
                            {cat.name}
                            {roundLabel ? ` · ${roundLabel}` : ''}
                          </span>
                        )}
                        {scoreStr && (
                          <span className="text-xs font-mono text-slate-500">· {scoreStr}</span>
                        )}
                      </div>
                      {tournamentName && (
                        <p className="text-xs text-slate-700 mt-0.5 truncate">{tournamentName}</p>
                      )}
                    </div>

                    {/* Rating change */}
                    <div className="shrink-0 text-right">
                      <p className={`text-sm font-bold tabular-nums ${deltaColor}`}>{deltaStr}</p>
                      <p className="text-xs text-slate-600 tabular-nums">{Number(h.rating_after).toFixed(2)}</p>
                    </div>

                    {/* Date */}
                    <p className="shrink-0 text-xs text-slate-600 w-14 text-right hidden sm:block">
                      {new Date(h.played_at).toLocaleDateString('en-AU', {
                        day: 'numeric',
                        month: 'short',
                        year: total > PAGE_SIZE ? 'numeric' : undefined,
                      })}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-6 flex items-center justify-between">
            <Link
              href={pageUrl(page - 1)}
              className={`rounded-lg border border-surface-border px-4 py-2 text-sm text-slate-400 transition-colors ${
                page <= 1
                  ? 'pointer-events-none opacity-30'
                  : 'hover:bg-surface-card hover:text-white'
              }`}
            >
              ← Previous
            </Link>

            <p className="text-xs text-slate-600">
              Page {page} of {totalPages}
            </p>

            <Link
              href={pageUrl(page + 1)}
              className={`rounded-lg border border-surface-border px-4 py-2 text-sm text-slate-400 transition-colors ${
                page >= totalPages
                  ? 'pointer-events-none opacity-30'
                  : 'hover:bg-surface-card hover:text-white'
              }`}
            >
              Next →
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
