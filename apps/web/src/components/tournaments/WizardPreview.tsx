'use client';

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
              <div
                key={i}
                className="rounded-lg bg-surface ring-1 ring-surface-border px-3 py-2.5 space-y-1"
              >
                <p className="text-sm font-medium text-white">{cat.name}</p>
                {cat.player_count > 0 && (
                  <p className="text-xs text-slate-400">
                    {cat.player_count} players
                    {cat.format ? ` · ${cat.format}` : ''}
                  </p>
                )}
                {cat.draw_format && (
                  <p className="text-xs text-slate-500">{cat.draw_format}</p>
                )}
                {cat.scoring?.points_per_set > 0 && (
                  <p className="text-xs text-slate-500">
                    {cat.scoring.points_per_set} pts · Best of {cat.scoring.sets_per_match}
                    {cat.scoring.deuce_rule ? ' · Deuce on' : ''}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        <Field label="Additional notes" value={config.notes} />
      </div>
    </div>
  );
}
