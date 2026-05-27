'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createTournamentAsSuperAdminAction } from '@/lib/actions/superadmin';

interface Club {
  id: string;
  name: string;
  slug: string;
}

interface Props {
  clubs: Club[];
}

export function SuperAdminTournamentsClient({ clubs }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [clubId, setClubId] = useState('');
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [venue, setVenue] = useState('');
  const [status, setStatus] = useState<'draft' | 'registration_open' | 'in_progress' | 'completed'>('draft');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleNameChange(value: string) {
    setName(value);
    // Auto-generate slug from name
    setSlug(
      value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, ''),
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!clubId) { setError('Please select a club.'); return; }
    if (!startDate || !endDate) { setError('Start and end dates are required.'); return; }
    if (new Date(endDate) < new Date(startDate)) { setError('End date must be after start date.'); return; }

    startTransition(async () => {
      const result = await createTournamentAsSuperAdminAction({
        clubId, name: name.trim(), slug: slug.trim(), startDate, endDate,
        venue: venue.trim() || undefined,
        status: status as 'draft' | 'registration_open' | 'in_progress' | 'completed',
      });

      if ('error' in result) {
        setError(result.error ?? 'Unknown error');
      } else {
        // Reset form state and close BEFORE setting success so the banner
        // renders outside the collapsible area (where it's always visible).
        setName(''); setSlug(''); setStartDate(''); setEndDate(''); setVenue('');
        setClubId(''); setStatus('draft');
        setOpen(false);
        setSuccess(`Tournament "${result.tournament.name}" created successfully.`);
        router.refresh();
      }
    });
  }

  return (
    <div className="rounded-xl bg-surface-card ring-1 ring-surface-border">
      <button
        onClick={() => { setOpen((p) => { if (!p) setSuccess(null); return !p; }); }}
        className="w-full flex items-center justify-between px-5 py-4 text-sm font-semibold text-slate-300 hover:text-white transition-colors"
      >
        <span>+ Create tournament</span>
        <span className={`transition-transform text-xs ${open ? 'rotate-180' : ''}`}>▼</span>
      </button>

      {/* Success banner — shown collapsed, outside the form, so it's visible after form closes */}
      {success && !open && (
        <div className="border-t border-surface-border px-5 py-3 rounded-b-xl bg-green-950/60">
          <p className="text-xs text-green-400">✓ {success}</p>
        </div>
      )}

      {open && (
        <form onSubmit={handleSubmit} className="border-t border-surface-border px-5 pb-6 pt-4 space-y-4">
          {error && (
            <div className="rounded-lg border border-red-800 bg-red-950 px-3 py-2 text-xs text-red-400">{error}</div>
          )}

          {/* Club */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">Club *</label>
            <select
              value={clubId}
              onChange={(e) => setClubId(e.target.value)}
              required
              className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-white outline-none focus:border-brand-500"
            >
              <option value="">Select a club…</option>
              {clubs.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Name + slug */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">Tournament name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                required
                placeholder="Summer Open 2026"
                className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-white outline-none placeholder:text-slate-600 focus:border-brand-500"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">URL slug *</label>
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                required
                placeholder="summer-open-2026"
                className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-white outline-none placeholder:text-slate-600 focus:border-brand-500"
              />
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">Start date *</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
                className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-white outline-none focus:border-brand-500"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">End date *</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
                className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-white outline-none focus:border-brand-500"
              />
            </div>
          </div>

          {/* Venue + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">Venue</label>
              <input
                type="text"
                value={venue}
                onChange={(e) => setVenue(e.target.value)}
                placeholder="e.g. City Sports Centre"
                className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-white outline-none placeholder:text-slate-600 focus:border-brand-500"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as typeof status)}
                className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-white outline-none focus:border-brand-500"
              >
                <option value="draft">Draft</option>
                <option value="registration_open">Registration open</option>
                <option value="in_progress">In progress</option>
                <option value="completed">Completed</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg border border-surface-border px-4 py-2 text-sm text-slate-400 hover:text-slate-300 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
            >
              {pending ? 'Creating…' : 'Create tournament'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
