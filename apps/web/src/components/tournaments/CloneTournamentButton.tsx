'use client';

import { useTransition } from 'react';
import { cloneTournamentAction } from '@/lib/actions/tournaments';

export function CloneTournamentButton({ tournamentId }: { tournamentId: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      disabled={isPending}
      onClick={() => startTransition(async () => { await cloneTournamentAction(tournamentId); })}
      className="flex flex-col items-center justify-center gap-1 rounded-lg border border-surface-border px-3 py-3 text-sm text-slate-300 hover:bg-surface-card transition-colors disabled:opacity-50 min-h-[64px] text-center sm:flex-row sm:justify-start sm:gap-2 sm:min-h-0 sm:text-left sm:px-4 sm:py-2"
    >
      <span>📋</span> {isPending ? 'Cloning…' : 'Clone'}
    </button>
  );
}
