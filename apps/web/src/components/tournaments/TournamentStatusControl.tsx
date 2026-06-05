'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  updateTournamentStatusAction,
  type TournamentStatus,
} from '@/lib/actions/tournaments';
import { useConfirm } from '@/components/ui/ConfirmProvider';

interface Transition {
  label: string;
  nextStatus: TournamentStatus;
  className: string;
}

const TRANSITIONS: Record<TournamentStatus, Transition | null> = {
  draft: {
    label: 'Open registrations',
    nextStatus: 'registration_open',
    className: 'bg-blue-600 hover:bg-blue-700 text-white',
  },
  registration_open: {
    label: 'Start tournament',
    nextStatus: 'in_progress',
    className: 'bg-accent-500 hover:bg-accent-600 text-white',
  },
  in_progress: {
    label: 'Mark completed',
    nextStatus: 'completed',
    className: 'bg-brand-600 hover:bg-brand-700 text-white',
  },
  completed: null,
  cancelled: null,
};

interface Props {
  tournamentId: string;
  currentStatus: TournamentStatus;
}

export function TournamentStatusControl({ tournamentId, currentStatus }: Props) {
  const router = useRouter();
  const { confirm } = useConfirm();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const transition = TRANSITIONS[currentStatus];

  async function handleTransition() {
    if (!transition) return;
    setLoading(true);
    setError(null);
    const result = await updateTournamentStatusAction(tournamentId, transition.nextStatus);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    } else {
      router.refresh();
      setLoading(false);
    }
  }

  async function handleCancel() {
    if (!await confirm({ title: 'Cancel tournament?', message: 'This will permanently cancel the tournament. All participants will be notified. This cannot be undone.', confirmLabel: 'Cancel tournament', variant: 'danger' })) return;
    setLoading(true);
    const result = await updateTournamentStatusAction(tournamentId, 'cancelled');
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    } else {
      router.refresh();
      setLoading(false);
    }
  }

  if (currentStatus === 'completed' || currentStatus === 'cancelled') return null;

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
      {error && <p className="text-sm text-red-400">{error}</p>}

      {transition && (
        <button
          onClick={handleTransition}
          disabled={loading}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50 ${transition.className}`}
        >
          {loading ? 'Updating…' : transition.label}
        </button>
      )}

      <button
        onClick={handleCancel}
        disabled={loading}
        className="rounded-lg border border-red-700 px-4 py-2 text-sm font-semibold text-red-400 hover:bg-red-950 hover:border-red-600 transition-colors disabled:opacity-50"
      >
        Cancel tournament
      </button>
    </div>
  );
}
