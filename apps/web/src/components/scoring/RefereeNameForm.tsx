'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { startRefereeSessionAction } from '@/lib/actions/referee';

interface Props {
  pin: string;
  /** The PIN label set by the admin — this becomes the referee's identity. */
  pinLabel: string;
}

export function RefereeNameForm({ pin, pinLabel }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await startRefereeSessionAction(pin);
      if (result.error) {
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface p-4">
      <div className="w-full max-w-sm rounded-2xl bg-surface-card p-8 ring-1 ring-surface-border">
        {/* Identity badge */}
        <div className="mb-6 text-center">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-brand-900/50 ring-2 ring-brand-500/30 mb-4">
            <span className="text-2xl">🎾</span>
          </div>
          <h1 className="text-xl font-bold text-white mb-1">Referee check-in</h1>
          <p className="text-sm text-slate-500">You&apos;re signing in as:</p>
          <p className="mt-2 text-lg font-semibold text-brand-300 bg-brand-900/30 rounded-xl px-4 py-2">
            {pinLabel}
          </p>
          <p className="mt-2 text-xs text-slate-600">
            This name was set by the tournament admin and matches your assigned matches.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          {error && (
            <p className="mb-4 text-sm text-red-400 text-center">{error}</p>
          )}
          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded-lg bg-brand-600 py-3 text-sm font-semibold text-white hover:bg-brand-500 transition-colors disabled:opacity-50"
          >
            {isPending ? 'Checking in…' : 'Start scoring →'}
          </button>
        </form>
      </div>
    </div>
  );
}
