'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { approvePlayerReportAction, rejectPlayerReportAction } from '@/lib/actions/scoring';

interface DisputeMatch {
  id: string;
  tournamentSlug: string;
  categoryName: string;
  roundLabel: string;
  playerA: string;
  playerB: string;
  reportedWinnerName: string;
  reportedSets: string; // "11-7, 11-9"
}

function DisputeRow({ m, tournamentSlug }: { m: DisputeMatch; tournamentSlug: string }) {
  const [isPending, startTransition] = useTransition();
  const [dismissed, setDismissed] = useState(false);
  const [action, setAction] = useState<'approve' | 'reject' | null>(null);

  if (dismissed) return null;

  return (
    <div className="flex items-center gap-4 px-5 py-4 flex-wrap">
      <div className="flex-1 min-w-0">
        <p className="text-xs text-amber-400/70 mb-0.5">{m.categoryName} · {m.roundLabel}</p>
        <p className="text-sm font-medium text-white truncate">
          {m.playerA} <span className="text-slate-500">vs</span> {m.playerB}
        </p>
        <p className="text-xs text-slate-400 mt-0.5">
          Reported: <span className="text-white font-medium">{m.reportedWinnerName}</span> won
          {m.reportedSets ? <span className="text-slate-500"> · {m.reportedSets}</span> : ''}
        </p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          disabled={isPending}
          onClick={() => {
            setAction('approve');
            startTransition(async () => {
              await approvePlayerReportAction(m.id);
              setDismissed(true);
            });
          }}
          className="rounded-lg bg-accent-600/20 px-3 py-1.5 text-xs font-semibold text-accent-400 hover:bg-accent-600/30 transition-colors disabled:opacity-50"
        >
          {isPending && action === 'approve' ? '…' : '✓ Approve'}
        </button>
        <button
          disabled={isPending}
          onClick={() => {
            setAction('reject');
            startTransition(async () => {
              await rejectPlayerReportAction(m.id);
              setDismissed(true);
            });
          }}
          className="rounded-lg border border-red-900/50 px-3 py-1.5 text-xs text-red-400 hover:bg-red-950/40 hover:border-red-800/60 transition-colors disabled:opacity-50"
        >
          {isPending && action === 'reject' ? '…' : '✗ Reject'}
        </button>
        <Link
          href={`/tournaments/${tournamentSlug}/scoring/${m.id}`}
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:text-white hover:border-slate-500 transition-colors"
        >
          Review
        </Link>
      </div>
    </div>
  );
}

export function DisputeQueue({
  matches,
  tournamentSlug,
}: {
  matches: DisputeMatch[];
  tournamentSlug: string;
}) {
  if (matches.length === 0) return null;

  return (
    <div className="mb-8 rounded-xl bg-amber-900/10 ring-1 ring-amber-700/30 overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-3 border-b border-amber-700/20">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-black">
          {matches.length}
        </span>
        <h2 className="text-sm font-semibold text-amber-300">Player-reported scores pending review</h2>
      </div>

      <div className="divide-y divide-amber-700/10">
        {matches.map((m) => (
          <DisputeRow key={m.id} m={m} tournamentSlug={tournamentSlug} />
        ))}
      </div>
    </div>
  );
}
