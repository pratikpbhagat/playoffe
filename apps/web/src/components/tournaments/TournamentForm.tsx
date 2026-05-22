'use client';

import { useState } from 'react';
import { createTournamentAction } from '@/lib/actions/tournaments';

interface Club {
  id: string;
  name: string;
}

interface Props {
  clubs: Club[];
  defaultClubId?: string;
}

const inputClass =
  'block w-full rounded-lg border border-slate-600 bg-surface px-3 py-2 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30';

const labelClass = 'mb-1.5 block text-sm font-medium text-slate-300';

export function TournamentForm({ clubs, defaultClubId }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clubId, setClubId] = useState(defaultClubId ?? clubs[0]?.id ?? '');

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const fd = new FormData(e.currentTarget);

    const result = await createTournamentAction({
      club_id: clubId,
      name: fd.get('name') as string,
      description: (fd.get('description') as string) || undefined,
      venue: (fd.get('venue') as string) || undefined,
      start_date: fd.get('start_date') as string,
      end_date: fd.get('end_date') as string,
      court_count: parseInt(fd.get('court_count') as string, 10) || 1,
      registration_deadline: (fd.get('registration_deadline') as string) || undefined,
      max_participants: fd.get('max_participants')
        ? parseInt(fd.get('max_participants') as string, 10)
        : undefined,
    });

    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
    // On success the action redirects
  }

  if (clubs.length === 0) {
    return (
      <div className="rounded-lg border border-amber-800 bg-amber-950/50 px-4 py-3 text-sm text-amber-300">
        You need to{' '}
        <a href="/clubs/new" className="underline hover:text-amber-200">
          create a club
        </a>{' '}
        before you can create a tournament.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="rounded-lg border border-red-800 bg-red-950 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Club selector */}
      <div>
        <label className={labelClass}>
          Club <span className="text-red-400">*</span>
        </label>
        <select
          value={clubId}
          onChange={(e) => setClubId(e.target.value)}
          required
          className={`${inputClass} cursor-pointer`}
        >
          {clubs.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* Tournament name */}
      <div>
        <label className={labelClass}>
          Tournament name <span className="text-red-400">*</span>
        </label>
        <input
          name="name"
          type="text"
          required
          minLength={3}
          maxLength={120}
          placeholder="e.g. Summer Open 2026"
          className={inputClass}
        />
      </div>

      {/* Dates */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass}>
            Start date <span className="text-red-400">*</span>
          </label>
          <input name="start_date" type="date" required className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>
            End date <span className="text-red-400">*</span>
          </label>
          <input name="end_date" type="date" required className={inputClass} />
        </div>
      </div>

      {/* Venue + Courts */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label className={labelClass}>Venue</label>
          <input
            name="venue"
            type="text"
            maxLength={200}
            placeholder="e.g. Westside Sports Centre"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>
            Courts <span className="text-red-400">*</span>
          </label>
          <input
            name="court_count"
            type="number"
            required
            min={1}
            max={50}
            defaultValue={2}
            className={inputClass}
          />
        </div>
      </div>

      {/* Optional fields */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Registration deadline</label>
          <input name="registration_deadline" type="date" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Max participants</label>
          <input
            name="max_participants"
            type="number"
            min={4}
            max={512}
            placeholder="Unlimited"
            className={inputClass}
          />
        </div>
      </div>

      {/* Description */}
      <div>
        <label className={labelClass}>Description</label>
        <textarea
          name="description"
          rows={3}
          maxLength={1000}
          placeholder="Optional notes about this tournament"
          className={`${inputClass} resize-none`}
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? 'Creating tournament…' : 'Create tournament'}
      </button>
    </form>
  );
}
