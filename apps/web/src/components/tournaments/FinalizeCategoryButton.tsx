'use client';

import { useState, useTransition } from 'react';
import { finalizeCategoryResultsAction } from '@/lib/actions/categories';

interface Props {
  categoryId: string;
  categoryName: string;
  hasResults: boolean; // true if winner_entry_id already set
}

export function FinalizeCategoryButton({ categoryId, categoryName, hasResults }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (done || hasResults) return null;

  return (
    <div className="flex items-center gap-3">
      <button
        disabled={isPending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await finalizeCategoryResultsAction(categoryId);
            if ('error' in result && result.error) {
              setError(result.error);
            } else {
              setDone(true);
            }
          });
        }}
        className="rounded-lg bg-brand-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
      >
        {isPending ? 'Finalizing…' : 'Finalize results'}
      </button>
      {error && (
        <span className="text-xs text-red-400">{error}</span>
      )}
    </div>
  );
}
