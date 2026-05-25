'use client';

import { useTransition } from 'react';
import { cloneTournamentAction } from '@/lib/actions/tournaments';

export function CloneTournamentButton({ tournamentId }: { tournamentId: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      disabled={isPending}
      onClick={() => startTransition(async () => { await cloneTournamentAction(tournamentId); })}
      className="flex items-center gap-2 rounded-lg border border-surface-border px-4 py-2 text-sm text-slate-300 hover:bg-surface-card transition-colors disabled:opacity-50"
    >
      <span>📋</span> {isPending ? 'Cloning…' : 'Clone'}
    </button>
  );
}
