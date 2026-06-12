'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import type { MatchWithPlayers } from '@/lib/actions/draws';

/** Canonical knockout-stage hierarchy, earliest to latest — used to order
 *  bracket columns chronologically regardless of the order in which the
 *  matches were created (and thus regardless of their `round` numbers). */
const STAGE_HIERARCHY = ['Round of 32', 'Round of 16', 'Quarter-final', 'Semi-final', '3rd place playoff', 'Final'];

function stageRank(roundName: string | null | undefined, fallback: number): number {
  if (!roundName) return fallback;
  const idx = STAGE_HIERARCHY.indexOf(roundName);
  return idx === -1 ? fallback : idx;
}

interface Props {
  matches: MatchWithPlayers[];
  format: string;
  tournamentSlug: string;
  readOnly?: boolean; // when true, match tiles are non-clickable divs
  // Swap / adjust-draw mode
  adjustMode?: boolean;
  selectedEntryId?: string | null;
  onEntryClick?: (entryId: string, entryName: string) => void;
}

// ── Single match card ─────────────────────────────────────────────────────────
function MatchCard({
  match, tournamentSlug, readOnly,
  adjustMode, selectedEntryId, onEntryClick, lockedEntryIds,
}: {
  match: MatchWithPlayers; tournamentSlug: string; readOnly?: boolean;
  adjustMode?: boolean; selectedEntryId?: string | null;
  onEntryClick?: (id: string, name: string) => void;
  lockedEntryIds?: Set<string>;
}) {
  const isCompleted = match.status === 'completed' || match.status === 'walkover';

  const sets = Array.isArray(match.sets)
    ? (match.sets as { score_a: number; score_b: number }[])
    : [];

  // Per-player set scores — only shown once the match is done
  const aScores = isCompleted ? sets.map((s) => s.score_a) : [];
  const bScores = isCompleted ? sets.map((s) => s.score_b) : [];

  function PlayerRow({
    entry,
    isWinner,
    setScores,
  }: {
    entry: MatchWithPlayers['entry_a'];
    isWinner: boolean;
    setScores: number[];
  }) {
    const isBye = entry === null;
    const isSelected = adjustMode && !isBye && entry?.id === selectedEntryId;
    const isLocked   = adjustMode && !isBye && entry?.id != null && (lockedEntryIds?.has(entry.id) ?? false);
    const isClickable = adjustMode && !isBye && entry?.id != null && !isLocked;

    const entryName = entry ? (entry.partner_name ? `${entry.player_name} / ${entry.partner_name}` : entry.player_name) : '';

    const rowBase = `flex items-center gap-1.5 px-3 py-1.5 transition-all ${isWinner ? 'bg-brand-600/20' : ''}`;
    const adjustStyle = isClickable
      ? `${rowBase} cursor-pointer ${isSelected ? 'bg-amber-500/20 ring-1 ring-amber-500/60' : 'hover:bg-amber-500/10'}`
      : isLocked
        ? `${rowBase} opacity-40 cursor-not-allowed`
        : rowBase;

    const inner = (
      <div className={adjustMode ? adjustStyle : rowBase}>
        {/* Seed */}
        {entry?.seed ? (
          <span className="w-4 shrink-0 text-center text-[10px] font-bold text-brand-400">
            {entry.seed}
          </span>
        ) : (
          <span className="w-4 shrink-0" />
        )}

        {/* Name(s) — stacked for doubles, same style for both names */}
        <span className="flex-1 min-w-0">
          {(() => {
            const isWithdrawn = entry?.entry_status === 'withdrawn';
            const nameClass = `block text-xs leading-tight ${
              isBye
                ? 'italic text-slate-600'
                : isWithdrawn
                  ? 'text-slate-500 line-through'
                  : isWinner
                    ? 'font-semibold text-white'
                    : isCompleted
                      ? 'text-slate-500'
                      : 'text-slate-300'
            }`;
            return (
              <>
                <span className={nameClass}>{isBye ? 'TBD' : entry.player_name}</span>
                {!isBye && entry.partner_name && (
                  <span className={`${nameClass} mt-0.5`}>{entry.partner_name}</span>
                )}
                {isWithdrawn && (
                  <span className="block text-[9px] font-semibold uppercase tracking-wide text-red-500/80 leading-tight mt-0.5">
                    Withdrawn
                  </span>
                )}
              </>
            );
          })()}
        </span>

        {/* Per-set scores next to name */}
        {setScores.length > 0 && (
          <span className={`shrink-0 flex gap-1 font-mono text-[11px] tabular-nums ${
            isWinner ? 'font-semibold text-white' : 'text-slate-500'
          }`}>
            {setScores.map((s, i) => <span key={i}>{s}</span>)}
          </span>
        )}
        {/* Adjust mode: selected indicator */}
        {isSelected && (
          <span className="ml-1 shrink-0 text-[10px] font-semibold text-amber-400">●</span>
        )}
        {/* Adjust mode: locked indicator */}
        {isLocked && (
          <span className="ml-1 shrink-0 text-[10px] text-slate-600">🔒</span>
        )}
      </div>
    );

    if (isClickable) {
      return (
        <button
          type="button"
          onClick={() => onEntryClick?.(entry!.id, entryName)}
          className="block w-full text-left"
        >
          {inner}
        </button>
      );
    }
    return inner;
  }

  const aWins = match.winner_entry_id === match.entry_a?.id;
  const bWins = match.winner_entry_id === match.entry_b?.id;

  // Auto-advance byes
  const isByeMatch = match.entry_a === null || match.entry_b === null;

  const inner = (
    <>
      <PlayerRow entry={match.entry_a} isWinner={aWins} setScores={aScores} />
      <div className="relative border-t border-surface-border">
        <span className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 rounded-full border border-surface-border bg-surface-card px-1.5 text-[9px] font-semibold uppercase tracking-wide text-slate-500">
          vs
        </span>
      </div>
      <PlayerRow entry={match.entry_b} isWinner={bWins} setScores={bScores} />
    </>
  );

  const isDoubles = !!(match.entry_a?.partner_name || match.entry_b?.partner_name);
  const cardClass = `${isDoubles ? 'w-56' : 'w-44'} overflow-hidden rounded-lg ring-1 ${
    isByeMatch
      ? 'opacity-40 ring-surface-border'
      : match.status === 'in_progress'
        ? 'ring-accent-500/60'
        : readOnly
          ? 'ring-surface-border'
          : 'ring-surface-border hover:ring-brand-500/40'
  } bg-surface-card transition-all`;

  if (isByeMatch || readOnly) {
    return <div className={cardClass}>{inner}</div>;
  }
  return (
    <Link href={`/tournaments/${tournamentSlug}/scoring/${match.id}`} className={cardClass}>
      {inner}
    </Link>
  );
}

// ── Round column ──────────────────────────────────────────────────────────────
function RoundColumn({
  round_name, matches, matchSlots, tournamentSlug, readOnly,
  adjustMode, selectedEntryId, onEntryClick, lockedEntryIds,
}: {
  round_name: string; matches: MatchWithPlayers[]; matchSlots: number;
  tournamentSlug: string; readOnly?: boolean;
  adjustMode?: boolean; selectedEntryId?: string | null;
  onEntryClick?: (id: string, name: string) => void;
  lockedEntryIds?: Set<string>;
}) {
  const slotsPerMatch = matchSlots / matches.length;

  return (
    <div className="flex flex-col" style={{ minWidth: '180px' }}>
      <div className="mb-3 text-center text-xs font-semibold uppercase tracking-widest text-slate-500">
        {round_name}
      </div>
      <div className="flex flex-1 flex-col">
        {matches.map((m) => (
          <div key={m.id} className="flex items-center justify-center py-2" style={{ flex: slotsPerMatch }}>
            <MatchCard
              match={m} tournamentSlug={tournamentSlug} readOnly={readOnly}
              adjustMode={adjustMode} selectedEntryId={selectedEntryId}
              onEntryClick={onEntryClick} lockedEntryIds={lockedEntryIds}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Mobile round navigator (used inside elimination brackets) ─────────────────
function MobileRoundNav({
  rounds, maxSlots, tournamentSlug, readOnly,
  adjustMode, selectedEntryId, onEntryClick, lockedEntryIds,
}: {
  rounds: [number, MatchWithPlayers[]][];
  maxSlots: number; tournamentSlug: string; readOnly?: boolean;
  adjustMode?: boolean; selectedEntryId?: string | null;
  onEntryClick?: (id: string, name: string) => void;
  lockedEntryIds?: Set<string>;
}) {
  const [idx, setIdx] = useState(0);
  const [, roundMatches] = rounds[idx];
  const name = roundMatches[0].round_name ?? `Round ${roundMatches[0].round}`;

  return (
    <div>
      {/* Round navigator header */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setIdx((i) => Math.max(0, i - 1))}
          disabled={idx === 0}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-400 hover:bg-surface disabled:opacity-30 transition-colors"
        >
          ← Prev
        </button>
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-white">{name}</p>
          <p className="text-[10px] text-slate-600 mt-0.5">
            Round {idx + 1} of {rounds.length}
          </p>
        </div>
        <button
          onClick={() => setIdx((i) => Math.min(rounds.length - 1, i + 1))}
          disabled={idx === rounds.length - 1}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-400 hover:bg-surface disabled:opacity-30 transition-colors"
        >
          Next →
        </button>
      </div>

      {/* Dot indicators */}
      <div className="flex justify-center gap-1.5 mb-4">
        {rounds.map((_, i) => (
          <button
            key={i}
            onClick={() => setIdx(i)}
            className={`h-1.5 rounded-full transition-all ${
              i === idx ? 'w-4 bg-brand-400' : 'w-1.5 bg-surface-border'
            }`}
          />
        ))}
      </div>

      {/* Current round matches */}
      <div className="flex flex-col" style={{ minHeight: `${Math.max(maxSlots * 72, 200)}px` }}>
        <RoundColumn
          round_name="" matches={roundMatches} matchSlots={maxSlots}
          tournamentSlug={tournamentSlug} readOnly={readOnly}
          adjustMode={adjustMode} selectedEntryId={selectedEntryId}
          onEntryClick={onEntryClick} lockedEntryIds={lockedEntryIds}
        />
      </div>
    </div>
  );
}

// ── Bracket (single elimination) ─────────────────────────────────────────────
function EliminationBracket({
  matches, tournamentSlug, readOnly,
  adjustMode, selectedEntryId, onEntryClick, lockedEntryIds,
}: {
  matches: MatchWithPlayers[]; tournamentSlug: string; readOnly?: boolean;
  adjustMode?: boolean; selectedEntryId?: string | null;
  onEntryClick?: (id: string, name: string) => void;
  lockedEntryIds?: Set<string>;
}) {
  // Group by round
  const roundMap = new Map<number, MatchWithPlayers[]>();
  for (const m of matches) {
    const list = roundMap.get(m.round) ?? [];
    list.push(m);
    roundMap.set(m.round, list);
  }
  const rounds = Array.from(roundMap.entries()).sort(([a, aMatches], [b, bMatches]) => {
    const aRank = stageRank(aMatches[0]?.round_name, a + STAGE_HIERARCHY.length);
    const bRank = stageRank(bMatches[0]?.round_name, b + STAGE_HIERARCHY.length);
    if (aRank !== bRank) return aRank - bRank;
    return a - b;
  });
  if (rounds.length === 0) return null;

  const maxSlots = rounds[0][1].length; // first round has the most matches

  return (
    <>
      {/* Mobile: swipeable round-by-round navigator */}
      <div className="md:hidden">
        <MobileRoundNav
          rounds={rounds} maxSlots={maxSlots} tournamentSlug={tournamentSlug} readOnly={readOnly}
          adjustMode={adjustMode} selectedEntryId={selectedEntryId}
          onEntryClick={onEntryClick} lockedEntryIds={lockedEntryIds}
        />
      </div>

      {/* Desktop: full horizontal bracket */}
      <div className="hidden md:block overflow-x-auto pb-4">
        <div className="flex gap-6" style={{ minHeight: `${Math.max(maxSlots * 72, 200)}px` }}>
          {rounds.map(([, roundMatches]) => {
            const name = roundMatches[0].round_name ?? `Round ${roundMatches[0].round}`;
            return (
              <RoundColumn
                key={roundMatches[0].round}
                round_name={name} matches={roundMatches} matchSlots={maxSlots}
                tournamentSlug={tournamentSlug} readOnly={readOnly}
                adjustMode={adjustMode} selectedEntryId={selectedEntryId}
                onEntryClick={onEntryClick} lockedEntryIds={lockedEntryIds}
              />
            );
          })}
        </div>
      </div>
    </>
  );
}

// ── Double elimination bracket ────────────────────────────────────────────────
function DoubleEliminationBracket({
  matches, tournamentSlug, readOnly,
  adjustMode, selectedEntryId, onEntryClick, lockedEntryIds,
}: {
  matches: MatchWithPlayers[]; tournamentSlug: string; readOnly?: boolean;
  adjustMode?: boolean; selectedEntryId?: string | null;
  onEntryClick?: (id: string, name: string) => void;
  lockedEntryIds?: Set<string>;
}) {
  const winners = matches.filter((m) => m.bracket_type === 'winners');
  const losers  = matches.filter((m) => m.bracket_type === 'losers');
  const gf      = matches.filter((m) => m.bracket_type === 'grand_final');

  function buildSectionRounds(sectionMatches: MatchWithPlayers[]) {
    const roundMap = new Map<number, MatchWithPlayers[]>();
    for (const m of sectionMatches) {
      const list = roundMap.get(m.round) ?? [];
      list.push(m);
      roundMap.set(m.round, list);
    }
    return Array.from(roundMap.entries()).sort(([a], [b]) => a - b);
  }

  const wbRounds = buildSectionRounds(winners);
  const lbRounds = buildSectionRounds(losers);
  const gfRounds = buildSectionRounds(gf);

  const wbMaxSlots = wbRounds[0]?.[1].length ?? 1;
  const lbMaxSlots = lbRounds[0]?.[1].length ?? 1;

  return (
    <div className="space-y-8">
      {/* Winners bracket */}
      {wbRounds.length > 0 && (
        <div>
          <p className="mb-3 text-xs font-bold uppercase tracking-widest text-green-500">
            Winners Bracket
          </p>
          <div className="md:hidden">
            <MobileRoundNav
              rounds={wbRounds} maxSlots={wbMaxSlots} tournamentSlug={tournamentSlug} readOnly={readOnly}
              adjustMode={adjustMode} selectedEntryId={selectedEntryId} onEntryClick={onEntryClick} lockedEntryIds={lockedEntryIds}
            />
          </div>
          <div className="hidden md:block overflow-x-auto pb-2">
            <div className="flex gap-6" style={{ minHeight: `${Math.max(wbMaxSlots * 72, 140)}px` }}>
              {wbRounds.map(([, roundMatches]) => (
                <RoundColumn
                  key={roundMatches[0].round}
                  round_name={roundMatches[0].round_name ?? `Round ${roundMatches[0].round}`}
                  matches={roundMatches} matchSlots={wbMaxSlots}
                  tournamentSlug={tournamentSlug} readOnly={readOnly}
                  adjustMode={adjustMode} selectedEntryId={selectedEntryId}
                  onEntryClick={onEntryClick} lockedEntryIds={lockedEntryIds}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Losers bracket */}
      {lbRounds.length > 0 && (
        <div>
          <p className="mb-3 text-xs font-bold uppercase tracking-widest text-amber-500">
            Losers Bracket
          </p>
          <div className="md:hidden">
            <MobileRoundNav
              rounds={lbRounds} maxSlots={lbMaxSlots} tournamentSlug={tournamentSlug} readOnly={readOnly}
              adjustMode={adjustMode} selectedEntryId={selectedEntryId} onEntryClick={onEntryClick} lockedEntryIds={lockedEntryIds}
            />
          </div>
          <div className="hidden md:block overflow-x-auto pb-2">
            <div className="flex gap-6" style={{ minHeight: `${Math.max(lbMaxSlots * 72, 100)}px` }}>
              {lbRounds.map(([, roundMatches]) => (
                <RoundColumn
                  key={roundMatches[0].round}
                  round_name={roundMatches[0].round_name ?? `Round ${roundMatches[0].round}`}
                  matches={roundMatches} matchSlots={lbMaxSlots}
                  tournamentSlug={tournamentSlug} readOnly={readOnly}
                  adjustMode={adjustMode} selectedEntryId={selectedEntryId}
                  onEntryClick={onEntryClick} lockedEntryIds={lockedEntryIds}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Grand Final */}
      {gfRounds.length > 0 && (
        <div>
          <p className="mb-3 text-xs font-bold uppercase tracking-widest text-brand-400">
            Grand Final
          </p>
          <div className="flex gap-6">
            {gfRounds.map(([, roundMatches]) => (
              <RoundColumn
                key={roundMatches[0].round}
                round_name="Grand Final"
                matches={roundMatches}
                matchSlots={1}
                tournamentSlug={tournamentSlug}
                readOnly={readOnly}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Round-robin schedule ──────────────────────────────────────────────────────
function RoundRobinMatchList({
  sectionMatches,
  sectionLabel,
  tournamentSlug,
  readOnly,
}: {
  sectionMatches: MatchWithPlayers[];
  sectionLabel: string;
  tournamentSlug: string;
  readOnly?: boolean;
}) {
  // Sort by round within the section
  const sorted = [...sectionMatches].sort((a, b) => a.round - b.round);

  const rowClass = `flex items-center gap-3 rounded-lg bg-surface-card px-4 py-2.5 ring-1 ring-surface-border transition-all ${
    readOnly ? '' : 'hover:ring-brand-500/40'
  }`;

  return (
    <div>
      {sectionLabel && (
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
          {sectionLabel}
        </h4>
      )}
      <div className="space-y-1.5">
        {sorted.map((m) => {
          const matchSets = Array.isArray(m.sets)
            ? (m.sets as { score_a: number; score_b: number }[])
            : [];
          const isDone = m.status === 'completed' || m.status === 'walkover';

          // Per-player scores shown inline next to each name
          const aScores = isDone ? matchSets.map((s) => s.score_a) : undefined;
          const bScores = isDone ? matchSets.map((s) => s.score_b) : undefined;

          const rowContent = (
            <>
              <PlayerChip entry={m.entry_a} winnerId={m.winner_entry_id} setScores={aScores} />
              <span className="shrink-0 text-xs font-bold text-slate-600">vs</span>
              <PlayerChip entry={m.entry_b} winnerId={m.winner_entry_id} setScores={bScores} />
              {!isDone && <StatusBadge status={m.status} />}
            </>
          );

          return readOnly ? (
            <div key={m.id} className={rowClass}>{rowContent}</div>
          ) : (
            <Link
              key={m.id}
              href={`/tournaments/${tournamentSlug}/scoring/${m.id}`}
              className={rowClass}
            >
              {rowContent}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ── Group section (group_stage_knockout) ─────────────────────────────────────
function GroupSection({
  groupName, groupMatches, tournamentSlug, readOnly,
  adjustMode, selectedEntryId, onEntryClick, isGroupLocked,
}: {
  groupName: string; groupMatches: MatchWithPlayers[];
  tournamentSlug: string; readOnly?: boolean;
  adjustMode?: boolean; selectedEntryId?: string | null;
  onEntryClick?: (id: string, name: string) => void;
  isGroupLocked?: boolean;
}) {
  // Extract unique participants from the match entries (dedupe by entry id)
  const participantMap = new Map<string, { id: string; playerName: string; partnerName: string | null; seed: number | null; wins: number; losses: number; withdrawn: boolean }>();
  for (const m of groupMatches) {
    const isDone = m.status === 'completed' || m.status === 'walkover';
    for (const entry of [m.entry_a, m.entry_b]) {
      if (!entry) continue;
      if (!participantMap.has(entry.id)) {
        participantMap.set(entry.id, {
          id: entry.id,
          playerName: entry.player_name,
          partnerName: entry.partner_name ?? null,
          seed: entry.seed ?? null,
          wins: 0,
          losses: 0,
          withdrawn: entry.entry_status === 'withdrawn',
        });
      }
      if (isDone && m.winner_entry_id) {
        const p = participantMap.get(entry.id)!;
        if (m.winner_entry_id === entry.id) p.wins++;
        else p.losses++;
      }
    }
  }
  const participants = Array.from(participantMap.values()).sort((a, b) => {
    // Sort by wins desc, then seed asc
    if (b.wins !== a.wins) return b.wins - a.wins;
    return (a.seed ?? 999) - (b.seed ?? 999);
  });

  const anyResultsIn = participants.some((p) => p.wins > 0 || p.losses > 0);

  // Group matches by round
  const roundMap = new Map<number, MatchWithPlayers[]>();
  for (const m of groupMatches) {
    const list = roundMap.get(m.round) ?? [];
    list.push(m);
    roundMap.set(m.round, list);
  }
  const rounds = Array.from(roundMap.entries()).sort(([a, aMatches], [b, bMatches]) => {
    const aRank = stageRank(aMatches[0]?.round_name, a + STAGE_HIERARCHY.length);
    const bRank = stageRank(bMatches[0]?.round_name, b + STAGE_HIERARCHY.length);
    if (aRank !== bRank) return aRank - bRank;
    return a - b;
  });

  const rowClass = `flex items-center gap-3 rounded-lg bg-surface-card px-4 py-2.5 ring-1 ring-surface-border transition-all ${
    readOnly ? '' : 'hover:ring-brand-500/40'
  }`;

  return (
    <div className="rounded-xl border border-surface-border overflow-hidden">
      {/* Group header */}
      <div className="bg-surface-card px-4 py-3 border-b border-surface-border">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-bold text-white tracking-wide">{groupName}</p>
          <div className="flex items-center gap-2">
            {adjustMode && isGroupLocked && (
              <span className="text-[11px] text-slate-500">🔒 Locked</span>
            )}
            <span className="text-[11px] text-slate-500">{participants.length} players</span>
          </div>
        </div>

        {/* Participant list — only needed in adjust mode for swap selection;
            standings are already shown in the Group Standings table above. */}
        {adjustMode && (
        <div className="space-y-1.5">
          {participants.map((p, i) => {
            const displayName = p.partnerName ? `${p.playerName} / ${p.partnerName}` : p.playerName;
            const isSelected = adjustMode && p.id === selectedEntryId;
            const isClickable = adjustMode && !isGroupLocked && !p.withdrawn;

            const rowContent = (
              <>
                {/* Standing position */}
                <span className={`w-4 shrink-0 text-center text-[11px] font-bold ${
                  anyResultsIn ? i === 0 ? 'text-amber-400' : 'text-slate-500' : 'text-slate-600'
                }`}>
                  {anyResultsIn ? (i + 1) : '·'}
                </span>
                {/* Seed */}
                {p.seed && (
                  <span className="text-[10px] font-bold text-brand-400 w-4 shrink-0">[{p.seed}]</span>
                )}
                <span className={`flex-1 text-xs ${
                  p.withdrawn ? 'line-through text-slate-600'
                  : anyResultsIn && i === 0 ? 'font-semibold text-white'
                  : 'text-slate-300'
                }`}>
                  {displayName}
                  {p.withdrawn && (
                    <span className="ml-1.5 no-underline text-[9px] font-semibold uppercase tracking-wide text-red-500/70">WD</span>
                  )}
                </span>
                {/* W/L record */}
                {anyResultsIn && (
                  <span className="shrink-0 text-[11px] text-slate-500 font-mono">
                    {p.wins}W&nbsp;{p.losses}L
                  </span>
                )}
                {/* Selected indicator */}
                {isSelected && (
                  <span className="shrink-0 text-[10px] font-semibold text-amber-400 ml-1">●</span>
                )}
              </>
            );

            if (isClickable) {
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onEntryClick?.(p.id, displayName)}
                  className={`flex w-full items-center gap-2.5 rounded-md px-1.5 py-1 -mx-1.5 text-left transition-all ${
                    isSelected
                      ? 'bg-amber-500/20 ring-1 ring-amber-500/50'
                      : 'hover:bg-amber-500/10'
                  }`}
                >
                  {rowContent}
                </button>
              );
            }
            return (
              <div key={p.id} className="flex items-center gap-2.5">
                {rowContent}
              </div>
            );
          })}
        </div>
        )}
      </div>

      {/* Matches, grouped by round */}
      <div className="px-4 py-3 space-y-3 bg-surface/30">
        {rounds.map(([round, roundMatches]) => (
          <div key={round}>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-600">
              {roundMatches[0].round_name ?? `Round ${round}`}
            </p>
            <div className="space-y-1.5">
              {roundMatches.map((m) => {
                const matchSets = Array.isArray(m.sets)
                  ? (m.sets as { score_a: number; score_b: number }[])
                  : [];
                const isDone = m.status === 'completed' || m.status === 'walkover';
                const aScores = isDone ? matchSets.map((s) => s.score_a) : undefined;
                const bScores = isDone ? matchSets.map((s) => s.score_b) : undefined;

                const rowContent = (
                  <>
                    <PlayerChip entry={m.entry_a} winnerId={m.winner_entry_id} setScores={aScores} />
                    <span className="shrink-0 text-xs font-bold text-slate-600">vs</span>
                    <PlayerChip entry={m.entry_b} winnerId={m.winner_entry_id} setScores={bScores} />
                    {!isDone && <StatusBadge status={m.status} />}
                  </>
                );

                return readOnly ? (
                  <div key={m.id} className={rowClass}>{rowContent}</div>
                ) : (
                  <Link
                    key={m.id}
                    href={`/tournaments/${tournamentSlug}/scoring/${m.id}`}
                    className={rowClass}
                  >
                    {rowContent}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RoundRobinBracket({
  matches, tournamentSlug, readOnly, format,
  adjustMode, selectedEntryId, onEntryClick, lockedGroupNames,
}: {
  matches: MatchWithPlayers[]; tournamentSlug: string; readOnly?: boolean; format?: string;
  adjustMode?: boolean; selectedEntryId?: string | null;
  onEntryClick?: (id: string, name: string) => void;
  lockedGroupNames?: Set<string>;
}) {
  // For group_stage_knockout: group by group_name first (alphabetical), then knockout (null) last
  if (format === 'group_stage_knockout') {
    const groupMap = new Map<string, MatchWithPlayers[]>();
    const knockoutMatches: MatchWithPlayers[] = [];

    for (const m of matches) {
      if (!m.group_name) {
        knockoutMatches.push(m);
      } else {
        const list = groupMap.get(m.group_name) ?? [];
        list.push(m);
        groupMap.set(m.group_name, list);
      }
    }

    const sortedGroupNames = Array.from(groupMap.keys()).sort();

    return (
      <div className="space-y-5">
        {/* Group stage — one card per group with participants + rounds */}
        {sortedGroupNames.length > 0 && (
          <div>
            <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-slate-500">
              Group Stage
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              {sortedGroupNames.map((groupName) => (
                <GroupSection
                  key={groupName}
                  groupName={groupName}
                  groupMatches={groupMap.get(groupName)!}
                  tournamentSlug={tournamentSlug}
                  readOnly={readOnly}
                  adjustMode={adjustMode}
                  selectedEntryId={selectedEntryId}
                  onEntryClick={onEntryClick}
                  isGroupLocked={lockedGroupNames?.has(groupName) ?? false}
                />
              ))}
            </div>
          </div>
        )}

        {/* Knockout stage — uses same match-list style */}
        {knockoutMatches.length > 0 && (
          <div>
            <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-slate-500">
              Knockout Stage
            </p>
            <EliminationBracket
              matches={knockoutMatches}
              tournamentSlug={tournamentSlug}
              readOnly={readOnly}
              adjustMode={adjustMode}
              selectedEntryId={selectedEntryId}
              onEntryClick={onEntryClick}
              lockedEntryIds={new Set()} /* KO slots are TBD pre-promotion */
            />
          </div>
        )}
      </div>
    );
  }

  // Standard round-robin / swiss: group by round number
  const roundMap = new Map<number, MatchWithPlayers[]>();
  for (const m of matches) {
    const list = roundMap.get(m.round) ?? [];
    list.push(m);
    roundMap.set(m.round, list);
  }
  const rounds = Array.from(roundMap.entries()).sort(([a, aMatches], [b, bMatches]) => {
    const aRank = stageRank(aMatches[0]?.round_name, a + STAGE_HIERARCHY.length);
    const bRank = stageRank(bMatches[0]?.round_name, b + STAGE_HIERARCHY.length);
    if (aRank !== bRank) return aRank - bRank;
    return a - b;
  });

  return (
    <div className="space-y-6">
      {rounds.map(([round, roundMatches]) => (
        <RoundRobinMatchList
          key={round}
          sectionMatches={roundMatches}
          sectionLabel={roundMatches[0].round_name ?? `Round ${round}`}
          tournamentSlug={tournamentSlug}
          readOnly={readOnly}
        />
      ))}
    </div>
  );
}

function PlayerChip({
  entry,
  winnerId,
  setScores,
}: {
  entry: MatchWithPlayers['entry_a'];
  winnerId: string | null;
  setScores?: number[];
}) {
  const isWinner = entry !== null && winnerId === entry.id;
  const isWithdrawn = entry?.entry_status === 'withdrawn';
  const nameClass = entry === null
    ? 'italic text-slate-600'
    : isWithdrawn
      ? 'text-slate-500 line-through'
      : isWinner
        ? 'font-semibold text-white'
        : winnerId
          ? 'text-slate-500'
          : 'text-slate-300';

  return (
    <span className="flex flex-1 items-start gap-1.5 min-w-0">
      {/* Names — stacked for doubles, identical style for both */}
      <span className="flex flex-col flex-1 min-w-0">
        <span className={`text-sm leading-tight ${nameClass}`}>
          {entry?.seed ? <span className="mr-1 text-xs text-brand-400">[{entry.seed}]</span> : null}
          {entry ? entry.player_name : 'TBD'}
        </span>
        {entry?.partner_name && (
          <span className={`text-sm leading-tight mt-0.5 ${nameClass}`}>
            {entry.partner_name}
          </span>
        )}
        {isWithdrawn && (
          <span className="text-[9px] font-semibold uppercase tracking-wide text-red-500/80 leading-tight mt-0.5">
            Withdrawn
          </span>
        )}
      </span>

      {/* Per-set scores */}
      {setScores && setScores.length > 0 && (
        <span className={`shrink-0 flex gap-1 font-mono text-xs tabular-nums self-center ${
          isWinner ? 'font-semibold text-white' : 'text-slate-500'
        }`}>
          {setScores.map((s, i) => <span key={i}>{s}</span>)}
        </span>
      )}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    scheduled: { label: 'Scheduled', className: 'text-slate-400' },
    in_progress: { label: 'Live', className: 'text-accent-400 font-semibold' },
    completed: { label: 'Done', className: 'text-slate-500' },
    walkover: { label: 'W/O', className: 'text-slate-500' },
  };
  const b = map[status] ?? { label: status, className: 'text-slate-600' };
  return <span className={`shrink-0 text-xs ${b.className}`}>{b.label}</span>;
}

// ── Main export ───────────────────────────────────────────────────────────────
export function BracketView({
  matches, format, tournamentSlug, readOnly,
  adjustMode, selectedEntryId, onEntryClick,
}: Props) {
  // Entries whose matches have been played — can't be swapped
  const lockedEntryIds = useMemo<Set<string>>(() => {
    if (!adjustMode) return new Set();
    const s = new Set<string>();
    for (const m of matches) {
      if (m.status !== 'scheduled') {
        if (m.entry_a?.id) s.add(m.entry_a.id);
        if (m.entry_b?.id) s.add(m.entry_b.id);
      }
    }
    return s;
  }, [adjustMode, matches]);

  // Group names that contain at least one played match (entire group locked)
  const lockedGroupNames = useMemo<Set<string>>(() => {
    if (!adjustMode) return new Set();
    const s = new Set<string>();
    for (const m of matches) {
      if (m.group_name && m.status !== 'scheduled') s.add(m.group_name);
    }
    return s;
  }, [adjustMode, matches]);

  if (matches.length === 0) {
    return <p className="text-sm italic text-slate-600">No matches found.</p>;
  }

  const adjustProps = { adjustMode, selectedEntryId, onEntryClick };

  if (format === 'double_elimination') {
    return (
      <DoubleEliminationBracket
        matches={matches} tournamentSlug={tournamentSlug} readOnly={readOnly}
        {...adjustProps} lockedEntryIds={lockedEntryIds}
      />
    );
  }
  if (format === 'single_elimination') {
    return (
      <EliminationBracket
        matches={matches} tournamentSlug={tournamentSlug} readOnly={readOnly}
        {...adjustProps} lockedEntryIds={lockedEntryIds}
      />
    );
  }
  return (
    <RoundRobinBracket
      matches={matches} tournamentSlug={tournamentSlug} readOnly={readOnly} format={format}
      {...adjustProps} lockedGroupNames={lockedGroupNames}
    />
  );
}
