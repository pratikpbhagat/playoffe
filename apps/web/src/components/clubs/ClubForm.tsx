'use client';

import { useState } from 'react';
import { createClubAction } from '@/lib/actions/clubs';

const PRESET_COLORS = [
  '#7c3aed', // brand purple
  '#2563eb', // blue
  '#059669', // green
  '#dc2626', // red
  '#d97706', // amber
  '#0891b2', // cyan
  '#be185d', // pink
  '#4f46e5', // indigo
];

const inputClass =
  'block w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30';

export function ClubForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [color, setColor] = useState('#7c3aed');

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const fd = new FormData(e.currentTarget);
    const result = await createClubAction({
      name: fd.get('name') as string,
      city: fd.get('city') as string,
      location: fd.get('location') as string,
      description: fd.get('description') as string,
      brand_primary_color: color,
    });

    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
    // On success the server action redirects — no need to handle here
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="rounded-lg border border-red-800 bg-red-950 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-300">
          Club name <span className="text-red-400">*</span>
        </label>
        <input
          name="name"
          type="text"
          required
          minLength={2}
          maxLength={80}
          placeholder="e.g. Westside Pickleball Club"
          className={inputClass}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-300">City</label>
          <input
            name="city"
            type="text"
            maxLength={80}
            placeholder="e.g. Melbourne"
            className={inputClass}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-300">Venue / location</label>
          <input
            name="location"
            type="text"
            maxLength={200}
            placeholder="e.g. 123 Main St"
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-300">Description</label>
        <textarea
          name="description"
          rows={3}
          maxLength={500}
          placeholder="A short description of your club (optional)"
          className={`${inputClass} resize-none`}
        />
      </div>

      {/* Brand color picker */}
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-300">Brand colour</label>
        <div className="flex flex-wrap items-center gap-2">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className="h-7 w-7 rounded-full ring-offset-2 ring-offset-surface transition focus:outline-none"
              style={{
                backgroundColor: c,
                boxShadow: color === c ? `0 0 0 2px #fff` : 'none',
              }}
              title={c}
            />
          ))}
          <label className="ml-1 flex cursor-pointer items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300">
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-5 w-5 cursor-pointer rounded border-0 bg-transparent"
            />
            Custom
          </label>
        </div>
        <p className="mt-1.5 text-xs text-slate-500">
          Used on your tournament display screen and public pages.
        </p>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? 'Creating club…' : 'Create club'}
      </button>
    </form>
  );
}
