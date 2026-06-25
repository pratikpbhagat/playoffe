'use client';

import { useState } from 'react';

export interface ScheduleSettings {
  startDatetime: string;       // "2026-07-12T09:00"
  matchDurationMins: number;
  changeoverMins: number;
  knockoutBufferMins: number;
  availableCourts: number[];
}

interface Props {
  /** Current tournament start date (YYYY-MM-DD) */
  startDate: string;
  /** Total available courts */
  courtCount: number;
  /** Suggested match duration (derived from scoring format) */
  suggestedMatchDuration: number;
  /** Tournament default changeover */
  defaultChangeoverMins: number;
  /** Tournament default start time ("09:00") */
  defaultStartTime: string;
  onGenerate: (settings: ScheduleSettings) => void;
  onClose: () => void;
  generating: boolean;
  /** Per-category breakdown — shown as a preview so organisers can see each
   *  category gets its own match duration instead of one tournament-wide value. */
  categoryPreview?: { name: string; matchCount: number; durationMins: number }[];
}

export function ScheduleSettingsModal({
  startDate,
  courtCount,
  suggestedMatchDuration,
  defaultChangeoverMins,
  defaultStartTime,
  onGenerate,
  onClose,
  generating,
  categoryPreview = [],
}: Props) {
  const [startDatetime, setStartDatetime] = useState(
    `${startDate}T${defaultStartTime.slice(0, 5)}`,
  );
  const [matchDuration, setMatchDuration]     = useState(suggestedMatchDuration);
  const [changeover, setChangeover]           = useState(defaultChangeoverMins);
  const [knockoutBuffer, setKnockoutBuffer]   = useState(15);
  const [maxCourt, setMaxCourt]               = useState(courtCount);

  const availableCourts = Array.from({ length: maxCourt }, (_, i) => i + 1);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onGenerate({
      startDatetime,
      matchDurationMins:  matchDuration,
      changeoverMins:     changeover,
      knockoutBufferMins: knockoutBuffer,
      availableCourts,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-md rounded-2xl bg-surface-card ring-1 ring-surface-border shadow-2xl p-6">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">Generate schedule</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              All groups will be auto-assigned to courts and times.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-300 transition-colors text-lg leading-none"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Start datetime */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              Tournament start date &amp; time
            </label>
            <input
              type="datetime-local"
              value={startDatetime}
              onChange={(e) => setStartDatetime(e.target.value)}
              required
              className="block w-full rounded-lg border border-slate-700 bg-surface px-3 py-2 text-sm text-white outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30"
            />
          </div>

          {/* Match duration */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Default duration (min)
              </label>
              <input
                type="number"
                min={5}
                max={180}
                value={matchDuration}
                onChange={(e) => setMatchDuration(parseInt(e.target.value) || 30)}
                className="block w-full rounded-lg border border-slate-700 bg-surface px-3 py-2 text-sm text-white outline-none focus:border-brand-500"
              />
              <p className="mt-1 text-[10px] text-slate-600">
                {categoryPreview.length > 1
                  ? 'Fallback only — each category below uses its own scoring-based duration'
                  : 'Rally 1-set ≈ 15 min · Traditional 1-set ≈ 25 min'}
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Changeover (min)
              </label>
              <input
                type="number"
                min={0}
                max={60}
                value={changeover}
                onChange={(e) => setChangeover(parseInt(e.target.value) || 0)}
                className="block w-full rounded-lg border border-slate-700 bg-surface px-3 py-2 text-sm text-white outline-none focus:border-brand-500"
              />
              <p className="mt-1 text-[10px] text-slate-600">Between consecutive matches</p>
            </div>
          </div>

          {/* Courts */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Courts to use (1 – {courtCount})
              </label>
              <input
                type="number"
                min={1}
                max={courtCount}
                value={maxCourt}
                onChange={(e) => setMaxCourt(Math.min(courtCount, Math.max(1, parseInt(e.target.value) || 1)))}
                className="block w-full rounded-lg border border-slate-700 bg-surface px-3 py-2 text-sm text-white outline-none focus:border-brand-500"
              />
              <p className="mt-1 text-[10px] text-slate-600">
                Courts {availableCourts.join(', ')} will be used
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Knockout buffer (min)
              </label>
              <input
                type="number"
                min={0}
                max={120}
                value={knockoutBuffer}
                onChange={(e) => setKnockoutBuffer(parseInt(e.target.value) || 0)}
                className="block w-full rounded-lg border border-slate-700 bg-surface px-3 py-2 text-sm text-white outline-none focus:border-brand-500"
              />
              <p className="mt-1 text-[10px] text-slate-600">Gap after last group match</p>
            </div>
          </div>

          {/* Per-category duration preview — only meaningful with 2+ categories */}
          {categoryPreview.length > 1 && (
            <div className="rounded-lg border border-surface-border bg-surface px-3 py-2.5">
              <p className="mb-1.5 text-xs font-semibold text-slate-300">
                {categoryPreview.length} categories in this schedule
              </p>
              <ul className="space-y-1">
                {categoryPreview.map((c) => (
                  <li key={c.name} className="flex items-center justify-between text-[11px] text-slate-400">
                    <span className="truncate">{c.name} <span className="text-slate-600">· {c.matchCount} match{c.matchCount !== 1 ? 'es' : ''}</span></span>
                    <span className="shrink-0 text-slate-300 font-medium">{c.durationMins} min/match</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Schedule logic note */}
          <div className="rounded-lg bg-brand-950/30 border border-brand-800/30 px-3 py-2.5 text-xs text-brand-300/80 space-y-1">
            <p className="font-semibold text-brand-300">How matches are scheduled:</p>
            <ul className="space-y-0.5 text-brand-400/70 list-disc list-inside">
              <li>Each group stays on one court — matches run back-to-back</li>
              <li>Multiple groups run in parallel across courts</li>
              <li>Knockout rounds start only after all group matches finish</li>
              {categoryPreview.length > 1 && (
                <li>All categories are scheduled together, sharing courts and avoiding overlaps</li>
              )}
            </ul>
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={generating}
              className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
            >
              {generating ? 'Generating…' : '⚡ Generate schedule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
