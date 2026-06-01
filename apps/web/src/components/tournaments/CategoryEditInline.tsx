'use client';

import { useState } from 'react';
import { updateCategoryAction } from '@/lib/actions/categories';
import { useRouter } from 'next/navigation';
import { WinByDeuceFields } from './WinByDeuceFields';

interface Props {
  categoryId: string;
  currentName: string;
  currentMaxEntries: number | null;
  currentPlayFormat: string;
  currentDrawFormat: string;
  canEditFormats: boolean; // only allowed before draw generation
  // Tournament-level scoring defaults (shown as hints)
  tournamentScoringFormat: 'rally' | 'traditional';
  tournamentNumSets: 1 | 3 | 5;
  tournamentPointsPerSet: number;
  tournamentWinBy: 1 | 2;
  tournamentDeuceCap: number | null;
  // Current category scoring override
  currentScoringOverride: boolean;
  currentScoringFormat: 'rally' | 'traditional' | null;
  currentNumSets: 1 | 3 | 5 | null;
  currentPointsPerSet: number | null;
  currentWinBy: 1 | 2 | null;
  currentDeuceCap: number | null;
  // Draw format (for showing stage overrides hint)
  drawFormat: string;
}

const PLAY_FORMAT_OPTS = [
  { value: 'singles', label: 'Singles' },
  { value: 'doubles', label: 'Doubles' },
  { value: 'mixed_doubles', label: 'Mixed doubles' },
];

const DRAW_FORMAT_OPTS = [
  { value: 'round_robin', label: 'Round robin' },
  { value: 'single_elimination', label: 'Single elimination' },
  { value: 'double_elimination', label: 'Double elimination' },
  { value: 'group_stage_knockout', label: 'Group stage + knockout' },
  { value: 'swiss', label: 'Swiss' },
];

const inputClass =
  'block w-full rounded-lg border border-slate-600 bg-surface px-3 py-1.5 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30';

export function CategoryEditInline({
  categoryId,
  currentName,
  currentMaxEntries,
  currentPlayFormat,
  currentDrawFormat,
  canEditFormats,
  tournamentScoringFormat,
  tournamentNumSets,
  tournamentPointsPerSet,
  tournamentWinBy,
  tournamentDeuceCap,
  currentScoringOverride,
  currentScoringFormat,
  currentNumSets,
  currentPointsPerSet,
  currentWinBy,
  currentDeuceCap,
  drawFormat,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scoringOverride, setScoringOverride] = useState(currentScoringOverride);
  const [scoringFormat, setScoringFormat] = useState<'rally' | 'traditional'>(
    currentScoringFormat ?? tournamentScoringFormat,
  );
  const [numSets, setNumSets] = useState<1 | 3 | 5>(
    currentNumSets ?? tournamentNumSets,
  );
  const [winBy, setWinBy] = useState<1 | 2>(currentWinBy ?? tournamentWinBy);
  const [deuceCap, setDeuceCap] = useState(
    currentDeuceCap != null ? String(currentDeuceCap) : (tournamentDeuceCap != null ? String(tournamentDeuceCap) : ''),
  );

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const fd = new FormData(e.currentTarget);
    const maxEntriesRaw = fd.get('max_entries') as string;

    const result = await updateCategoryAction(categoryId, {
      name: fd.get('name') as string,
      max_entries: maxEntriesRaw ? parseInt(maxEntriesRaw, 10) : null,
      ...(canEditFormats && {
        play_format: fd.get('play_format') as string,
        draw_format: fd.get('draw_format') as string,
      }),
      scoring_override: scoringOverride,
      ...(scoringOverride && {
        scoring_format: scoringFormat,
        num_sets: numSets,
        points_per_set: parseInt(fd.get('points_per_set') as string, 10) || tournamentPointsPerSet,
        win_by: winBy,
        deuce_cap: deuceCap ? parseInt(deuceCap, 10) : null,
      }),
    });

    setLoading(false);

    if (result?.error) {
      setError(result.error);
    } else {
      setOpen(false);
      router.refresh();
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex flex-col items-center justify-center rounded-xl bg-surface-card px-4 py-3 ring-1 ring-surface-border hover:ring-brand-500/40 transition-colors text-center min-w-[60px]"
      >
        <span className="text-lg leading-none">✏️</span>
        <span className="mt-1 text-[11px] text-slate-400">Edit</span>
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full rounded-xl bg-surface-card ring-1 ring-surface-border p-5 space-y-4"
    >
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm font-semibold text-white">Edit category</p>
        <button
          type="button"
          onClick={() => { setOpen(false); setError(null); }}
          className="text-xs text-slate-500 hover:text-slate-300"
        >
          Cancel
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-800 bg-red-950 px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-400">Name</label>
          <input
            name="name"
            type="text"
            required
            minLength={2}
            maxLength={80}
            defaultValue={currentName}
            className={inputClass}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-400">
            Max entries <span className="text-slate-600">(blank = unlimited)</span>
          </label>
          <input
            name="max_entries"
            type="number"
            min={2}
            max={256}
            defaultValue={currentMaxEntries ?? ''}
            placeholder="Unlimited"
            className={inputClass}
          />
        </div>
      </div>

      {canEditFormats && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">Play format</label>
            <select name="play_format" defaultValue={currentPlayFormat} className={`${inputClass} cursor-pointer`}>
              {PLAY_FORMAT_OPTS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">Draw format</label>
            <select name="draw_format" defaultValue={currentDrawFormat} className={`${inputClass} cursor-pointer`}>
              {DRAW_FORMAT_OPTS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Scoring override */}
      <div className="rounded-lg border border-surface-border bg-surface px-4 py-3 space-y-3">
        <label className="flex items-start gap-3 cursor-pointer">
          <div className="flex-1">
            <p className="text-xs font-semibold text-slate-300">Override tournament scoring</p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              {scoringOverride
                ? 'This category uses its own scoring settings.'
                : `Using tournament default: ${tournamentScoringFormat === 'rally' ? 'Rally' : 'Service points'}, ${tournamentNumSets} set${tournamentNumSets > 1 ? 's' : ''}, ${tournamentPointsPerSet} pts.`}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={scoringOverride}
            onClick={() => setScoringOverride((v) => !v)}
            className={`relative mt-0.5 inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
              scoringOverride ? 'bg-brand-600' : 'bg-slate-700'
            }`}
          >
            <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ${scoringOverride ? 'translate-x-4' : 'translate-x-0'}`} />
          </button>
        </label>

        {scoringOverride && (
          <div className="space-y-3 pt-1 border-t border-surface-border">
            {/* Scoring format */}
            <div>
              <p className="mb-1.5 text-[11px] font-medium text-slate-400">Scoring format</p>
              <div className="flex gap-2">
                {(['rally', 'traditional'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setScoringFormat(v)}
                    className={`flex-1 rounded border px-2 py-1.5 text-xs transition-colors ${
                      scoringFormat === v
                        ? 'border-brand-500 bg-brand-600/20 text-white'
                        : 'border-slate-700 bg-surface text-slate-400 hover:border-slate-600'
                    }`}
                  >
                    {v === 'rally' ? 'Rally scoring' : 'Service points'}
                  </button>
                ))}
              </div>
            </div>

            {/* Number of sets */}
            <div>
              <p className="mb-1.5 text-[11px] font-medium text-slate-400">Number of sets</p>
              <div className="flex gap-2">
                {([1, 3, 5] as const).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setNumSets(n)}
                    className={`flex-1 rounded border px-2 py-1.5 text-xs transition-colors ${
                      numSets === n
                        ? 'border-brand-500 bg-brand-600/20 text-white'
                        : 'border-slate-700 bg-surface text-slate-400 hover:border-slate-600'
                    }`}
                  >
                    {n} set{n > 1 ? 's' : ''}
                  </button>
                ))}
              </div>
            </div>

            {/* Points per set */}
            <div>
              <label className="mb-1.5 block text-[11px] font-medium text-slate-400">Points per set</label>
              <input
                name="points_per_set"
                type="number"
                min={5}
                max={100}
                defaultValue={currentPointsPerSet ?? tournamentPointsPerSet}
                className={`${inputClass} w-28`}
              />
            </div>

            {/* Win-by / deuce */}
            <WinByDeuceFields
              winBy={winBy}
              deuceCapValue={deuceCap}
              onWinByChange={setWinBy}
              onDeuceCapChange={setDeuceCap}
            />
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-brand-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
        >
          {loading ? 'Saving…' : 'Save changes'}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setError(null); }}
          className="text-xs text-slate-500 hover:text-slate-300"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
