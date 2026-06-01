'use client';

/**
 * Reusable win-by / deuce-cap field group.
 * Used in TournamentForm, AddCategoryInline, CategoryEditInline, and StageScoringPanel.
 */

const inputClass =
  'block w-full rounded-lg border border-slate-600 bg-surface px-3 py-2 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30';

interface Props {
  winBy: 1 | 2;
  deuceCapValue: string; // controlled string value for the input
  onWinByChange: (v: 1 | 2) => void;
  onDeuceCapChange: (v: string) => void;
  /** Size variant — 'sm' for inline forms, 'md' for the main tournament form */
  size?: 'sm' | 'md';
}

export function WinByDeuceFields({
  winBy,
  deuceCapValue,
  onWinByChange,
  onDeuceCapChange,
  size = 'sm',
}: Props) {
  const labelCls = size === 'md'
    ? 'mb-1.5 block text-sm font-medium text-slate-300'
    : 'mb-1.5 block text-[11px] font-medium text-slate-400';

  const btnBase = 'flex-1 rounded border px-3 py-2 text-xs transition-colors text-left';
  const btnActive = 'border-brand-500 bg-brand-600/20 text-white';
  const btnInactive = 'border-slate-700 bg-surface text-slate-400 hover:border-slate-600';

  return (
    <div className="space-y-3">
      {/* Win-by mode */}
      <div>
        <p className={labelCls}>End-of-set rule</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onWinByChange(1)}
            className={`${btnBase} ${winBy === 1 ? btnActive : btnInactive}`}
          >
            <p className="font-semibold text-xs">Golden point</p>
            <p className="text-[10px] text-slate-500 mt-0.5">Next point wins when tied</p>
          </button>
          <button
            type="button"
            onClick={() => onWinByChange(2)}
            className={`${btnBase} ${winBy === 2 ? btnActive : btnInactive}`}
          >
            <p className="font-semibold text-xs">Advantage (deuce)</p>
            <p className="text-[10px] text-slate-500 mt-0.5">Must win by 2 points</p>
          </button>
        </div>
      </div>

      {/* Deuce cap — only relevant when win_by = 2 */}
      {winBy === 2 && (
        <div>
          <label className={labelCls}>
            Deuce cap{' '}
            <span className="text-slate-600 font-normal">(optional)</span>
          </label>
          <div className="flex items-center gap-3">
            <input
              name="deuce_cap"
              type="number"
              min={5}
              max={200}
              value={deuceCapValue}
              onChange={(e) => onDeuceCapChange(e.target.value)}
              placeholder="No cap"
              className={`${inputClass} w-28`}
            />
            <p className="text-[11px] text-slate-500 leading-snug">
              Switch to golden point when both players reach this score.
              {deuceCapValue
                ? ` E.g. tied at ${Number(deuceCapValue) - 1}–${Number(deuceCapValue) - 1} → golden point.`
                : ' Leave blank to play advantage indefinitely.'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
