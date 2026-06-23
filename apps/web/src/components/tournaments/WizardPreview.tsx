'use client';

import { useState } from 'react';
import type { WizardPartialConfig } from '@/app/api/wizard/turn/route';

interface Props {
  config: WizardPartialConfig;
}

const STEP_LABELS: Record<number, string> = {
  1: 'Name',
  2: 'Date',
  3: 'Venue',
  4: 'Courts',
  5: 'Categories',
  6: 'Player counts',
  7: 'Draw formats',
  8: 'Scoring',
  9: 'Notes',
  10: 'Ready to create',
};

type CategoryConfig = NonNullable<WizardPartialConfig['categories']>[number];

function CategoryCard({ cat }: { cat: CategoryConfig }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = Boolean(cat.draw_format) || (cat.scoring?.points_per_set ?? 0) > 0;

  return (
    <div className="rounded-lg bg-surface ring-1 ring-surface-border px-3 py-2.5">
      <button
        type="button"
        onClick={() => hasDetails && setExpanded((v) => !v)}
        className={`flex w-full items-start justify-between gap-2 text-left ${hasDetails ? 'cursor-pointer' : 'cursor-default'}`}
      >
        <div className="space-y-1">
          <p className="text-sm font-medium text-white">{cat.name}</p>
          {cat.player_count > 0 && (
            <p className="text-xs text-slate-400">
              {cat.player_count} players
              {cat.format ? ` · ${cat.format}` : ''}
            </p>
          )}
        </div>
        {hasDetails && (
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            className={`mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform ${expanded ? 'rotate-180' : ''}`}
          >
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z"
              clipRule="evenodd"
            />
          </svg>
        )}
      </button>
      {expanded && hasDetails && (
        <div className="mt-1.5 space-y-1 border-t border-surface-border pt-1.5">
          {cat.draw_format && <p className="text-xs text-slate-500">{cat.draw_format}</p>}
          {cat.scoring?.points_per_set > 0 && (
            <p className="text-xs text-slate-500">
              {cat.scoring.points_per_set} pts · Best of {cat.scoring.sets_per_match}
              {cat.scoring.scoring_format === 'traditional' ? ' · Traditional' : ''}
              {' · '}
              {cat.scoring.win_by === 1
                ? 'Golden point'
                : cat.scoring.deuce_cap
                  ? `Deuce → cap ${cat.scoring.deuce_cap}`
                  : 'Deuce'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </span>
      <span className="text-sm text-slate-200">{value}</span>
    </div>
  );
}

export function WizardPreview({ config }: Props) {
  const completedSteps = [
    config.name,
    config.start_date,
    config.venue,
    config.courts != null ? String(config.courts) : null,
    config.categories,
    null, // step 6 player counts (embedded in categories)
    null, // step 7 draw formats (embedded in categories)
    null, // step 8 scoring (embedded in categories)
    config.notes !== undefined ? 'done' : null,
  ].filter(Boolean).length;

  const progress = Math.min(completedSteps / 8, 1);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-surface-border shrink-0">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-slate-400">Live preview</span>
          <span className="text-[10px] text-slate-600">
            Step {config.step}/10 — {STEP_LABELS[config.step] ?? ''}
          </span>
        </div>
        {/* Progress bar */}
        <div className="h-1 rounded-full bg-surface overflow-hidden">
          <div
            className="h-full rounded-full bg-brand-500 transition-all duration-500"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>

      {/* Config fields */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-700 hover:[&::-webkit-scrollbar-thumb]:bg-slate-600">
        {!config.name && !config.start_date && !config.venue && (
          <p className="text-xs text-slate-600 italic">
            Answers will appear here as you confirm them.
          </p>
        )}

        <Field label="Tournament name" value={config.name} />
        <Field
          label="Date"
          value={
            config.start_date
              ? config.end_date && config.end_date !== config.start_date
                ? `${new Date(config.start_date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} – ${new Date(config.end_date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
                : new Date(config.start_date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
              : null
          }
        />
        <Field label="Venue" value={config.venue} />
        <Field
          label="Courts"
          value={config.courts != null ? `${config.courts} court${config.courts !== 1 ? 's' : ''}` : null}
        />

        {config.categories && config.categories.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Categories
            </span>
            {config.categories.map((cat, i) => (
              <CategoryCard key={i} cat={cat} />
            ))}
          </div>
        )}

        <Field label="Additional notes" value={config.notes} />
      </div>
    </div>
  );
}
