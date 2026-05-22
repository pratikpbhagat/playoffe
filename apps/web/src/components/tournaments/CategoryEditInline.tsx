'use client';

import { useState } from 'react';
import { updateCategoryAction } from '@/lib/actions/categories';
import { useRouter } from 'next/navigation';

interface Props {
  categoryId: string;
  currentName: string;
  currentMaxEntries: number | null;
  currentPlayFormat: string;
  currentDrawFormat: string;
  canEditFormats: boolean; // only allowed before draw generation
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
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        className="flex items-center gap-1.5 rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-surface hover:border-slate-500 transition-colors"
      >
        <span>✏️</span> Edit
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
