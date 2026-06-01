'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { MatchWithPlayers } from '@/lib/actions/draws';

interface Props {
  matches: MatchWithPlayers[];
  format: string;
  tournamentSlug: string;
  readOnly?: boolean; // when true, match tiles are non-clickable divs
}

// ── Single match card ─────────────────────────────────────────────────────────
function MatchCard({ match, tournamentSlug, readOnly }: { match: MatchWithPlayers; tournamentSlug: string; readOnly?: boolean }) {
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
    return (
      <div
        className={`flex items-center gap-1.5 px-3 py-1.5 ${
          isWinner ? 'bg-brand-600/20' : ''
        }`}
      >
        {/* Seed */}
        {entry?.seed ? (
          <span className="w-4 shrink-0 text-center text-[10px] font-bold text-brand-400">
            {entry.seed}
          </span>
        ) : (
          <span className="w-4 shrink-0" />
        )}

        {/* Name */}
        <span
          className={`flex-1 truncate text-xs ${
            isBye
              ? 'italic text-slate-600'
              : isWinner
                ? 'font-semibold text-white'
                : isCompleted
                  ? 'text-slate-500'
                  : 'text-slate-300'
          }`}
        >
          {isBye ? 'BYE' : entry.partner_name ? `${entry.player_name} / ${entry.partner_name}` : entry.player_name}
        </span>

        {/* Per-set scores next to name */}
        {setScores.length > 0 && (
          <span className={`shrink-0 flex gap-1 font-mono text-[11px] tabular-nums ${
            isWinner ? 'font-semibold text-white' : 'text-slate-500'
          }`}>
            {setScores.map((s, i) => <span key={i}>{s}</span>)}
          </span>
        )}
      </div>
    );
  }

  const aWins = match.winner_entry_id === match.entry_a?.id;
  const bWins = match.winner_entry_id === match.entry_b?.id;

  // Auto-advance byes
  const isByeMatch = match.entry_a === null || match.entry_b === null;

  const inner = (
    <>
      <PlayerRow entry={match.entry_a} isWinner={aWins} setScores={aScores} />
      <div className="border-t border-surface-border" />
      <PlayerRow entry={match.entry_b} isWinner={bWins} setScores={bScores} />
    </>
  );

  const cardClass = `w-44 overflow-hidden rounded-lg ring-1 ${
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
  round_name,
  matches,
  matchSlots,
  tournamentSlug,
  readOnly,
}: {
  round_name: string;
  matches: MatchWithPlayers[];
  matchSlots: number;
  tournamentSlug: string;
  readOnly?: boolean;
}) {
  const slotsPerMatch = matchSlots / matches.length;

  return (
    <div className="flex flex-col" style={{ minWidth: '180px' }}>
      <div className="mb-3 text-center text-xs font-semibold uppercase tracking-widest text-slate-500">
        {round_name}
      </div>
      <div className="flex flex-1 flex-col">
        {matches.map((m) => (
          <div
            key={m.id}
            className="flex items-center justify-center"
            style={{ flex: slotsPerMatch }}
          >
            <MatchCard match={m} tournamentSlug={tournamentSlug} readOnly={readOnly} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Mobile round navigator (used inside elimination brackets) ─────────────────
function MobileRoundNav({
  rounds,
  maxSlots,
  tournamentSlug,
  readOnly,
}: {
  rounds: [number, MatchWithPlayers[]][];
  maxSlots: number;
  tournamentSlug: string;
  readOnly?: boolean;
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
      <div
        className="flex flex-col"
        style={{ minHeight: `${Math.max(maxSlots * 72, 200)}px` }}
      >
        <RoundColumn
          round_name=""
          matches={roundMatches}
          matchSlots={maxSlots}
          tournamentSlug={tournamentSlug}
          readOnly={readOnly}
        />
      </div>
    </div>
  );
}

// ── Bracket (single elimination) ─────────────────────────────────────────────
function EliminationBracket({ matches, tournamentSlug, readOnly }: { matches: MatchWithPlayers[]; tournamentSlug: string; readOnly?: boolean }) {
  // Group by round
  const roundMap = new Map<number, MatchWithPlayers[]>();
  for (const m of matches) {
    const list = roundMap.get(m.round) ?? [];
    list.push(m);
    roundMap.set(m.round, list);
  }
  const rounds = Array.from(roundMap.entries()).sort(([a], [b]) => a - b);
  if (rounds.length === 0) return null;

  const maxSlots = rounds[0][1].length; // first round has the most matches

  return (
    <>
      {/* Mobile: swipeable round-by-round navigator */}
      <div className="md:hidden">
        <MobileRoundNav rounds={rounds} maxSlots={maxSlots} tournamentSlug={tournamentSlug} readOnly={readOnly} />
      </div>

      {/* Desktop: full horizontal bracket */}
      <div className="hidden md:block overflow-x-auto pb-4">
        <div
          className="flex gap-6"
          style={{ minHeight: `${Math.max(maxSlots * 72, 200)}px` }}
        >
          {rounds.map(([, roundMatches]) => {
            const name = roundMatches[0].round_name ?? `Round ${roundMatches[0].round}`;
            return (
              <RoundColumn
                key={roundMatches[0].round}
                round_name={name}
                matches={roundMatches}
                matchSlots={maxSlots}
                tournamentSlug={tournamentSlug}
                readOnly={readOnly}
              />
            );
          })}
        </div>
      </div>
    </>
  );
}

// ── Double elimination bracket ────────────────────────────────────────────────
function DoubleEliminationBracket({ matches, tournamentSlug, readOnly }: { matches: MatchWithPlayers[]; tournamentSlug: string; readOnly?: boolean }) {
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
            <MobileRoundNav rounds={wbRounds} maxSlots={wbMaxSlots} tournamentSlug={tournamentSlug} readOnly={readOnly} />
          </div>
          <div className="hidden md:block overflow-x-auto pb-2">
            <div className="flex gap-6" style={{ minHeight: `${Math.max(wbMaxSlots * 72, 140)}px` }}>
              {wbRounds.map(([, roundMatches]) => (
                <RoundColumn
                  key={roundMatches[0].round}
                  round_name={roundMatches[0].round_name ?? `Round ${roundMatches[0].round}`}
                  matches={roundMatches}
                  matchSlots={wbMaxSlots}
                  tournamentSlug={tournamentSlug}
                  readOnly={readOnly}
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
            <MobileRoundNav rounds={lbRounds} maxSlots={lbMaxSlots} tournamentSlug={tournamentSlug} readOnly={readOnly} />
          </div>
          <div className="hidden md:block overflow-x-auto pb-2">
            <div className="flex gap-6" style={{ minHeight: `${Math.max(lbMaxSlots * 72, 100)}px` }}>
              {lbRounds.map(([, roundMatches]) => (
                <RoundColumn
                  key={roundMatches[0].round}
                  round_name={roundMatches[0].round_name ?? `Round ${roundMatches[0].round}`}
                  matches={roundMatches}
                  matchSlots={lbMaxSlots}
                  tournamentSlug={tournamentSlug}
                  readOnly={readOnly}
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

function RoundRobinBracket({ matches, tournamentSlug, readOnly, format }: { matches: MatchWithPlayers[]; tournamentSlug: string; readOnly?: boolean; format?: string }) {
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
      <div className="space-y-6">
        {sortedGroupNames.map((groupName) => (
          <RoundRobinMatchList
            key={groupName}
            sectionMatches={groupMap.get(groupName)!}
            sectionLabel={groupName}
            tournamentSlug={tournamentSlug}
            readOnly={readOnly}
          />
        ))}
        {knockoutMatches.length > 0 && (
          <RoundRobinMatchList
            key="knockout"
            sectionMatches={knockoutMatches}
            sectionLabel="Knockout Stage"
            tournamentSlug={tournamentSlug}
            readOnly={readOnly}
          />
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
  const rounds = Array.from(roundMap.entries()).sort(([a], [b]) => a - b);

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
  return (
    <span className="flex flex-1 items-center gap-1.5 min-w-0">
      <span
        className={`flex-1 truncate text-sm ${
          entry === null
            ? 'italic text-slate-600'
            : isWinner
              ? 'font-semibold text-white'
              : winnerId
                ? 'text-slate-500'
                : 'text-slate-300'
        }`}
      >
        {entry?.seed ? <span className="mr-1 text-xs text-brand-400">[{entry.seed}]</span> : null}
        {entry ? (entry.partner_name ? `${entry.player_name} / ${entry.partner_name}` : entry.player_name) : 'TBD'}
      </span>
      {setScores && setScores.length > 0 && (
        <span className={`shrink-0 flex gap-1 font-mono text-xs tabular-nums ${
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
export function BracketView({ matches, format, tournamentSlug, readOnly }: Props) {
  if (matches.length === 0) {
    return (
      <p className="text-sm italic text-slate-600">No matches found.</p>
    );
  }

  if (format === 'double_elimination') {
    return <DoubleEliminationBracket matches={matches} tournamentSlug={tournamentSlug} readOnly={readOnly} />;
  }
  if (format === 'single_elimination') {
    return <EliminationBracket matches={matches} tournamentSlug={tournamentSlug} readOnly={readOnly} />;
  }
  return <RoundRobinBracket matches={matches} tournamentSlug={tournamentSlug} readOnly={readOnly} format={format} />;
}
