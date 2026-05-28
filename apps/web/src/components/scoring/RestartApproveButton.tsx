'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { approveMatchRestartAction } from '@/lib/actions/scoring';

interface Props {
  matchId: string;
  restartReason: string | null;
}

export function RestartApproveButton({ matchId, restartReason }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [approved, setApproved] = useState(false);

  function handleApprove() {
    setError(null);
    startTransition(async () => {
      const result = await approveMatchRestartAction(matchId);
      if (result?.error) {
        setError(result.error);
      } else {
        setApproved(true);
        router.refresh();
      }
    });
  }

  if (approved) {
    return (
      <span className="text-xs text-accent-400 font-medium">✓ Restarted — match moved to Upcoming</span>
    );
  }

  return (
    <div className="space-y-1">
      {restartReason && (
        <p className="text-[11px] text-amber-600 italic">Reason: {restartReason}</p>
      )}
      <button
        onClick={handleApprove}
        disabled={isPending}
        className="w-full rounded-lg bg-amber-600 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-700 transition-colors disabled:opacity-50"
      >
        {isPending ? 'Approving…' : '↺ Approve restart'}
      </button>
      {error && <p className="text-[11px] text-red-400">{error}</p>}
    </div>
  );
}
