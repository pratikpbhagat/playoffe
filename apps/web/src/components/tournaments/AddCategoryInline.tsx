'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createCategoryAction } from '@/lib/actions/categories';

const DRAW_FORMATS = [
  { value: 'single_elimination', label: 'Single elimination' },
  { value: 'double_elimination', label: 'Double elimination' },
  { value: 'round_robin', label: 'Round robin' },
  { value: 'group_stage_knockout', label: 'Group stage + knockout' },
  { value: 'swiss', label: 'Swiss' },
] as const;

const PLAY_FORMATS = [
  { value: 'singles', label: 'Singles' },
  { value: 'doubles', label: 'Doubles' },
  { value: 'mixed_doubles', label: 'Mixed doubles' },
] as const;

const CATEGORY_TYPES = [
  { value: 'open', label: 'Open' },
  { value: 'skill', label: 'Skill level' },
  { value: 'gender', label: 'Gender' },
  { value: 'age', label: 'Age group' },
] as const;

const inputClass =
  'block w-full rounded-lg border border-slate-600 bg-surface px-3 py-2 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30';

const labelClass = 'mb-1.5 block text-xs font-medium text-slate-400';

interface Props {
  tournamentId: string;
}

export function AddCategoryInline({ tournamentId }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const fd = new FormData(e.currentTarget);
    const result = await createCategoryAction(tournamentId, {
      name: fd.get('name') as string,
      type: fd.get('type') as 'skill' | 'age' | 'gender' | 'open',
      play_format: fd.get('play_format') as 'singles' | 'doubles' | 'mixed_doubles',
      draw_format: fd.get('draw_format') as
        | 'round_robin'
        | 'single_elimination'
        | 'double_elimination'
        | 'group_stage_knockout'
        | 'swiss',
      max_entries: fd.get('max_entries') ? Number(fd.get('max_entries')) : undefined,
      min_age: fd.get('min_age') ? Number(fd.get('min_age')) : undefined,
      max_age: fd.get('max_age') ? Number(fd.get('max_age')) : undefined,
      skill_levels: [],
    });

    if (result.error) {
      setError(result.error);
      setLoading(false);
    } else {
      setOpen(false);
      router.refresh();
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition-colors"
      >
        + Add category
      </button>
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-brand-500/30 bg-surface p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">New category</h3>
        <button
          onClick={() => { setOpen(false); setError(null); }}
          className="text-slate-500 hover:text-slate-300 transition-colors text-sm"
        >
          ✕ Cancel
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-800 bg-red-950 px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Name */}
        <div>
          <label className={labelClass}>Category name *</label>
          <input
            name="name"
            type="text"
            required
            minLength={2}
            maxLength={80}
            placeholder="e.g. Men's Singles Open"
            className={inputClass}
          />
        </div>

        {/* Type + Play format */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className={labelClass}>Type</label>
            <select name="type" className={`${inputClass} cursor-pointer`} defaultValue="open">
              {CATEGORY_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Play format</label>
            <select
              name="play_format"
              className={`${inputClass} cursor-pointer`}
              defaultValue="singles"
            >
              {PLAY_FORMATS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Draw format</label>
            <select
              name="draw_format"
              className={`${inputClass} cursor-pointer`}
              defaultValue="single_elimination"
            >
              {DRAW_FORMATS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Optional limits */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className={labelClass}>Max entries</label>
            <input
              name="max_entries"
              type="number"
              min={2}
              max={256}
              placeholder="Unlimited"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Min age</label>
            <input
              name="min_age"
              type="number"
              min={5}
              max={100}
              placeholder="Any"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Max age</label>
            <input
              name="max_age"
              type="number"
              min={5}
              max={100}
              placeholder="Any"
              className={inputClass}
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
          >
            {loading ? 'Saving…' : 'Save category'}
          </button>
        </div>
      </form>
    </div>
  );
}
