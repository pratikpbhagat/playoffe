'use client';

import { useState, useTransition } from 'react';
import { finalizeCategoryResultsAction, previewCategoryResultsAction } from '@/lib/actions/categories';

interface Props {
  categoryId: string;
  categoryName: string;
  hasResults: boolean; // true if winner_entry_id already set
}

interface PreviewEntry {
  id: string;
  name: string;
}

const PODIUM = [
  { key: 'winner',     emoji: '🥇', label: 'Champion',  color: '#fbbf24' },
  { key: 'runnerUp',   emoji: '🥈', label: 'Runner-up', color: '#94a3b8' },
  { key: 'thirdPlace', emoji: '🥉', label: '3rd Place', color: '#cd7c2e' },
] as const;

// Renders the "no results yet" placeholder, with a "Finalize results" action.
// Clicking it previews the would-be podium (in the same layout used once
// results are actually saved) before the organiser confirms.
export function FinalizeCategoryButton({ categoryId, categoryName, hasResults }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [preview, setPreview] = useState<Record<'winner' | 'runnerUp' | 'thirdPlace', PreviewEntry | null> | null>(null);

  if (done || hasResults) return null;

  async function handlePreview() {
    setError(null);
    setLoadingPreview(true);
    const result = await previewCategoryResultsAction(categoryId);
    if ('error' in result && result.error) {
      setError(result.error);
    } else if ('success' in result) {
      setPreview({ winner: result.winner ?? null, runnerUp: result.runnerUp ?? null, thirdPlace: result.thirdPlace ?? null });
    }
    setLoadingPreview(false);
  }

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await finalizeCategoryResultsAction(categoryId);
      if ('error' in result && result.error) {
        setError(result.error);
      } else {
        setDone(true);
      }
    });
  }

  if (preview) {
    return (
      <div>
        <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-surface-border">
          {PODIUM.map((pos) => {
            const entry = preview[pos.key];
            return (
              <div key={pos.key} className="px-6 py-5 text-center">
                <p className="text-2xl mb-1">{pos.emoji}</p>
                <p className="text-xs text-slate-500 mb-1">{pos.label}</p>
                <p className="font-semibold text-sm" style={{ color: entry ? pos.color : undefined }}>
                  {entry?.name ?? '—'}
                </p>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-3 border-t border-surface-border px-6 py-4">
          <p className="flex-1 text-xs text-slate-500">
            Confirm these results for <span className="text-slate-300">{categoryName}</span> and mark it as completed.
          </p>
          {error && <span className="text-xs text-red-400">{error}</span>}
          <button
            disabled={isPending}
            onClick={() => setPreview(null)}
            className="rounded-lg border border-slate-700 px-4 py-1.5 text-xs text-slate-300 hover:bg-surface transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            disabled={isPending}
            onClick={handleConfirm}
            className="rounded-lg bg-brand-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
          >
            {isPending ? 'Finalizing…' : 'Confirm & finalize'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 py-8 text-center">
      <p className="text-sm text-slate-600 mb-3">No results recorded yet</p>
      <button
        disabled={loadingPreview}
        onClick={handlePreview}
        className="rounded-lg bg-brand-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
      >
        {loadingPreview ? 'Loading…' : 'Finalize results'}
      </button>
      {error && (
        <p className="mt-2 text-xs text-red-400">{error}</p>
      )}
    </div>
  );
}
