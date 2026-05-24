'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { generateDrawAction, clearDrawAction, scheduleMatchesAction } from '@/lib/actions/draws';
import type { MatchWithPlayers } from '@/lib/actions/draws';
import { BracketView } from './BracketView';

interface Props {
  categoryId: string;
  tournamentSlug: string;
  drawFormat: string;
  categoryStatus: string;
  entryCount: number;
  initialMatches: MatchWithPlayers[];
}

const FORMAT_LABEL: Record<string, string> = {
  round_robin: 'Round robin',
  single_elimination: 'Single elimination',
  double_elimination: 'Double elimination',
  group_stage_knockout: 'Group stage + knockout',
  swiss: 'Swiss',
};

export function DrawSection({
  categoryId,
  tournamentSlug,
  drawFormat,
  categoryStatus,
  entryCount,
  initialMatches,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRegenConfirm, setShowRegenConfirm] = useState(false);
  const [matches, setMatches] = useState(initialMatches);

  const isDrawn = categoryStatus === 'draw_generated' || categoryStatus === 'in_progress' || categoryStatus === 'completed';

  // Count how many matches already have a court assigned
  const unscheduledCount = matches.filter(
    (m) => !m.court && m.entry_a !== null && m.entry_b !== null && (m.status === 'scheduled' || m.status === 'in_progress'),
  ).length;

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    const result = await generateDrawAction(categoryId);
    if (result.error) {
      setError(result.error);
    } else {
      router.refresh();
    }
    setLoading(false);
  }

  async function handleClear() {
    setShowRegenConfirm(false);
    setLoading(true);
    setError(null);
    await clearDrawAction(categoryId);
    setMatches([]);
    router.refresh();
    setLoading(false);
  }

  async function handleSchedule() {
    setScheduling(true);
    setError(null);
    const result = await scheduleMatchesAction(categoryId);
    if ('error' in result && result.error) {
      setError(result.error);
    } else {
      router.refresh();
    }
    setScheduling(false);
  }

  return (
    <section>
      {/* Section header */}
      <div className="mb-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Draw</h2>
          <p className="mt-0.5 text-xs text-slate-600">{FORMAT_LABEL[drawFormat] ?? drawFormat}</p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {isDrawn ? (
            <>
              {/* Match count chip */}
              <span className="rounded-full bg-surface-card px-3 py-1 text-xs text-slate-400 ring-1 ring-surface-border">
                {matches.length} match{matches.length !== 1 ? 'es' : ''}
              </span>

              {/* Auto-schedule courts button */}
              {categoryStatus === 'draw_generated' && unscheduledCount > 0 && !showRegenConfirm && (
                <button
                  onClick={handleSchedule}
                  disabled={scheduling}
                  className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-300 hover:border-brand-500 hover:text-brand-400 transition-colors disabled:opacity-50"
                >
                  {scheduling ? 'Scheduling…' : `Assign courts (${unscheduledCount})`}
                </button>
              )}

              {categoryStatus === 'draw_generated' && !showRegenConfirm && (
                <button
                  onClick={() => setShowRegenConfirm(true)}
                  className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-300 hover:border-red-600 hover:text-red-400 transition-colors"
                >
                  Regenerate
                </button>
              )}

              {showRegenConfirm && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-red-400">Delete existing draw?</span>
                  <button
                    onClick={handleClear}
                    disabled={loading}
                    className="rounded-lg bg-red-900/40 px-3 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-900/60 transition-colors disabled:opacity-50"
                  >
                    {loading ? '…' : 'Yes, regenerate'}
                  </button>
                  <button
                    onClick={() => setShowRegenConfirm(false)}
                    className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </>
          ) : (
            <button
              onClick={handleGenerate}
              disabled={loading || entryCount < 2}
              title={entryCount < 2 ? 'Need at least 2 entries' : undefined}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'Generating…' : 'Generate draw'}
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-lg border border-red-800 bg-red-950 px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Draw not yet generated */}
      {!isDrawn && !loading && (
        <div className="rounded-xl bg-surface-card p-8 text-center ring-1 ring-surface-border">
          <p className="text-2xl mb-2">🎯</p>
          <p className="text-sm font-medium text-white mb-1">Draw not generated yet</p>
          <p className="text-xs text-slate-500">
            {entryCount < 2
              ? 'Add at least 2 entries before generating a draw.'
              : `${entryCount} entr${entryCount === 1 ? 'y' : 'ies'} ready · click Generate draw to create the bracket`}
          </p>
        </div>
      )}

      {/* Bracket / schedule */}
      {isDrawn && matches.length > 0 && (
        <BracketView matches={matches} format={drawFormat} tournamentSlug={tournamentSlug} />
      )}
    </section>
  );
}
