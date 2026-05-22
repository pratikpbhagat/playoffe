'use client';

import Link from 'next/link';
import type { MatchWithPlayers } from '@/lib/actions/draws';

interface Props {
  matches: MatchWithPlayers[];
  format: string;
  tournamentId: string;
}

// ── Single match card ─────────────────────────────────────────────────────────
function MatchCard({ match, tournamentId }: { match: MatchWithPlayers; tournamentId: string }) {
  const isCompleted = match.status === 'completed' || match.status === 'walkover';

  function PlayerRow({
    entry,
    isWinner,
  }: {
    entry: MatchWithPlayers['entry_a'];
    isWinner: boolean;
  }) {
    const isBye = entry === null;
    return (
      <div
        className={`flex items-center gap-2 px-3 py-1.5 ${
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
          className={`truncate text-xs ${
            isBye
              ? 'italic text-slate-600'
              : isWinner
                ? 'font-semibold text-white'
                : isCompleted
                  ? 'text-slate-500'
                  : 'text-slate-300'
          }`}
        >
          {isBye ? 'BYE' : entry.player_name}
        </span>

        {/* Winner tick */}
        {isWinner && <span className="ml-auto shrink-0 text-xs text-brand-400">✓</span>}
      </div>
    );
  }

  const aWins = match.winner_entry_id === match.entry_a?.id;
  const bWins = match.winner_entry_id === match.entry_b?.id;

  // Auto-advance byes
  const isByeMatch = match.entry_a === null || match.entry_b === null;

  const inner = (
    <>
      <PlayerRow entry={match.entry_a} isWinner={aWins} />
      <div className="border-t border-surface-border" />
      <PlayerRow entry={match.entry_b} isWinner={bWins} />
    </>
  );

  const cardClass = `w-44 overflow-hidden rounded-lg ring-1 ${
    isByeMatch
      ? 'opacity-40 ring-surface-border'
      : match.status === 'in_progress'
        ? 'ring-accent-500/60'
        : 'ring-surface-border hover:ring-brand-500/40'
  } bg-surface-card transition-all`;

  if (isByeMatch) {
    return <div className={cardClass}>{inner}</div>;
  }
  return (
    <Link href={`/tournaments/${tournamentId}/scoring/${match.id}`} className={cardClass}>
      {inner}
    </Link>
  );
}

// ── Round column ──────────────────────────────────────────────────────────────
function RoundColumn({
  round_name,
  matches,
  matchSlots,
  tournamentId,
}: {
  round_name: string;
  matches: MatchWithPlayers[];
  matchSlots: number;
  tournamentId: string;
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
            <MatchCard match={m} tournamentId={tournamentId} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Bracket (elimination) ─────────────────────────────────────────────────────
function EliminationBracket({ matches, tournamentId }: { matches: MatchWithPlayers[]; tournamentId: string }) {
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
    <div className="overflow-x-auto pb-4">
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
              tournamentId={tournamentId}
            />
          );
        })}
      </div>
    </div>
  );
}

// ── Round-robin schedule ──────────────────────────────────────────────────────
function RoundRobinBracket({ matches, tournamentId }: { matches: MatchWithPlayers[]; tournamentId: string }) {
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
        <div key={round}>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
            {roundMatches[0].group_name
              ? `${roundMatches[0].group_name} · ${roundMatches[0].round_name ?? `Round ${round}`}`
              : (roundMatches[0].round_name ?? `Round ${round}`)}
          </h4>
          <div className="space-y-1.5">
            {roundMatches.map((m) => (
              <Link
                key={m.id}
                href={`/tournaments/${tournamentId}/scoring/${m.id}`}
                className="flex items-center gap-3 rounded-lg bg-surface-card px-4 py-2.5 ring-1 ring-surface-border hover:ring-brand-500/40 transition-all"
              >
                <PlayerChip entry={m.entry_a} winnerId={m.winner_entry_id} />
                <span className="shrink-0 text-xs font-bold text-slate-600">vs</span>
                <PlayerChip entry={m.entry_b} winnerId={m.winner_entry_id} />
                <StatusBadge status={m.status} />
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function PlayerChip({
  entry,
  winnerId,
}: {
  entry: MatchWithPlayers['entry_a'];
  winnerId: string | null;
}) {
  const isWinner = entry !== null && winnerId === entry.id;
  return (
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
      {entry ? entry.player_name : 'TBD'}
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
export function BracketView({ matches, format, tournamentId }: Props) {
  if (matches.length === 0) {
    return (
      <p className="text-sm italic text-slate-600">No matches found.</p>
    );
  }

  const isElimination =
    format === 'single_elimination' ||
    format === 'double_elimination';

  return isElimination ? (
    <EliminationBracket matches={matches} tournamentId={tournamentId} />
  ) : (
    <RoundRobinBracket matches={matches} tournamentId={tournamentId} />
  );
}
