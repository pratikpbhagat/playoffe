'use client';

import Link from 'next/link';
import type { MatchWithPlayers } from '@/lib/actions/draws';

interface Props {
  matches: MatchWithPlayers[];
  format: string;
  tournamentSlug: string;
}

// ── Single match card ─────────────────────────────────────────────────────────
function MatchCard({ match, tournamentSlug }: { match: MatchWithPlayers; tournamentSlug: string }) {
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
}: {
  round_name: string;
  matches: MatchWithPlayers[];
  matchSlots: number;
  tournamentSlug: string;
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
            <MatchCard match={m} tournamentSlug={tournamentSlug} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Bracket (single elimination) ─────────────────────────────────────────────
function EliminationBracket({ matches, tournamentSlug }: { matches: MatchWithPlayers[]; tournamentSlug: string }) {
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
              tournamentSlug={tournamentSlug}
            />
          );
        })}
      </div>
    </div>
  );
}

// ── Double elimination bracket ────────────────────────────────────────────────
function DoubleEliminationBracket({ matches, tournamentSlug }: { matches: MatchWithPlayers[]; tournamentSlug: string }) {
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
          <div className="overflow-x-auto pb-2">
            <div className="flex gap-6" style={{ minHeight: `${Math.max(wbMaxSlots * 72, 140)}px` }}>
              {wbRounds.map(([, roundMatches]) => (
                <RoundColumn
                  key={roundMatches[0].round}
                  round_name={roundMatches[0].round_name ?? `Round ${roundMatches[0].round}`}
                  matches={roundMatches}
                  matchSlots={wbMaxSlots}
                  tournamentSlug={tournamentSlug}
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
          <div className="overflow-x-auto pb-2">
            <div className="flex gap-6" style={{ minHeight: `${Math.max(lbMaxSlots * 72, 100)}px` }}>
              {lbRounds.map(([, roundMatches]) => (
                <RoundColumn
                  key={roundMatches[0].round}
                  round_name={roundMatches[0].round_name ?? `Round ${roundMatches[0].round}`}
                  matches={roundMatches}
                  matchSlots={lbMaxSlots}
                  tournamentSlug={tournamentSlug}
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
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Round-robin schedule ──────────────────────────────────────────────────────
function RoundRobinBracket({ matches, tournamentSlug }: { matches: MatchWithPlayers[]; tournamentSlug: string }) {
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
                href={`/tournaments/${tournamentSlug}/scoring/${m.id}`}
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
export function BracketView({ matches, format, tournamentSlug }: Props) {
  if (matches.length === 0) {
    return (
      <p className="text-sm italic text-slate-600">No matches found.</p>
    );
  }

  if (format === 'double_elimination') {
    return <DoubleEliminationBracket matches={matches} tournamentSlug={tournamentSlug} />;
  }
  if (format === 'single_elimination') {
    return <EliminationBracket matches={matches} tournamentSlug={tournamentSlug} />;
  }
  return <RoundRobinBracket matches={matches} tournamentSlug={tournamentSlug} />;
}
