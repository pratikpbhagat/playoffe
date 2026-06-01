'use client';

import { useState } from 'react';
import { createTournamentAction, updateTournamentAction } from '@/lib/actions/tournaments';
import { WinByDeuceFields } from './WinByDeuceFields';

interface Club {
  id: string;
  name: string;
}

interface DefaultValues {
  club_id: string;
  name: string;
  description?: string | null;
  venue?: string | null;
  start_date: string;
  end_date: string;
  court_count: number;
  registration_deadline?: string | null;
  max_participants?: number | null;
  auto_approve_entries: boolean;
  scoring_format?: 'rally' | 'traditional';
  num_sets?: 1 | 3 | 5;
  points_per_set?: number;
  win_by?: 1 | 2;
  deuce_cap?: number | null;
}

interface Props {
  clubs: Club[];
  defaultClubId?: string;
  mode?: 'create' | 'edit';
  tournamentId?: string;
  defaultValues?: DefaultValues;
}

const inputClass =
  'block w-full rounded-lg border border-slate-600 bg-surface px-3 py-2 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30';

const labelClass = 'mb-1.5 block text-sm font-medium text-slate-300';

export function TournamentForm({
  clubs,
  defaultClubId,
  mode = 'create',
  tournamentId,
  defaultValues,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clubId, setClubId] = useState(
    defaultValues?.club_id ?? defaultClubId ?? clubs[0]?.id ?? '',
  );
  const [autoApprove, setAutoApprove] = useState(
    defaultValues?.auto_approve_entries ?? true,
  );
  const [scoringFormat, setScoringFormat] = useState<'rally' | 'traditional'>(
    defaultValues?.scoring_format ?? 'rally',
  );
  const [numSets, setNumSets] = useState<1 | 3 | 5>(
    defaultValues?.num_sets ?? 1,
  );
  const [winBy, setWinBy] = useState<1 | 2>(defaultValues?.win_by ?? 2);
  const [deuceCap, setDeuceCap] = useState(
    defaultValues?.deuce_cap != null ? String(defaultValues.deuce_cap) : '',
  );

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const fd = new FormData(e.currentTarget);

    const input = {
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
      auto_approve_entries: autoApprove,
      scoring_format: scoringFormat,
      num_sets: numSets,
      points_per_set: parseInt(fd.get('points_per_set') as string, 10) || 11,
      win_by: winBy,
      deuce_cap: deuceCap ? parseInt(deuceCap, 10) : null,
    };

    let result: { error?: string } | undefined;

    if (mode === 'edit' && tournamentId) {
      result = await updateTournamentAction(tournamentId, input) ?? undefined;
    } else {
      result = await createTournamentAction(input) ?? undefined;
    }

    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
    // On success the action redirects
  }

  if (clubs.length === 0 && mode === 'create') {
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

      {/* Club selector — disabled in edit mode */}
      <div>
        <label className={labelClass}>
          Club <span className="text-red-400">*</span>
        </label>
        {mode === 'edit' ? (
          <div className={`${inputClass} cursor-not-allowed opacity-60`}>
            {clubs.find((c) => c.id === clubId)?.name ?? clubId}
          </div>
        ) : (
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
        )}
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
          defaultValue={defaultValues?.name}
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
          <input
            name="start_date"
            type="date"
            required
            defaultValue={defaultValues?.start_date}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>
            End date <span className="text-red-400">*</span>
          </label>
          <input
            name="end_date"
            type="date"
            required
            defaultValue={defaultValues?.end_date}
            className={inputClass}
          />
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
            defaultValue={defaultValues?.venue ?? ''}
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
            defaultValue={defaultValues?.court_count ?? 2}
            className={inputClass}
          />
        </div>
      </div>

      {/* Optional fields */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Registration deadline</label>
          <input
            name="registration_deadline"
            type="date"
            defaultValue={defaultValues?.registration_deadline ?? ''}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Max participants</label>
          <input
            name="max_participants"
            type="number"
            min={4}
            max={512}
            defaultValue={defaultValues?.max_participants ?? ''}
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
          defaultValue={defaultValues?.description ?? ''}
          placeholder="Optional notes about this tournament"
          className={`${inputClass} resize-none`}
        />
      </div>

      {/* ── Scoring defaults ──────────────────────────────────────────────── */}
      <div className="rounded-xl border border-surface-border bg-surface p-4 space-y-4">
        <div>
          <p className="text-sm font-medium text-slate-300">Scoring defaults</p>
          <p className="mt-0.5 text-xs text-slate-500">
            These apply to all categories. Individual categories can override them.
          </p>
        </div>

        {/* Scoring format */}
        <div>
          <label className={labelClass}>Scoring format</label>
          <div className="flex gap-2">
            {([
              { value: 'rally', label: 'Rally scoring', desc: 'Every rally scores a point' },
              { value: 'traditional', label: 'Service points', desc: 'Only serving team scores' },
            ] as const).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setScoringFormat(opt.value)}
                className={`flex-1 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                  scoringFormat === opt.value
                    ? 'border-brand-500 bg-brand-600/20 text-white'
                    : 'border-slate-600 bg-surface text-slate-400 hover:border-slate-500'
                }`}
              >
                <p className="text-xs font-semibold">{opt.label}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">{opt.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Number of sets */}
        <div>
          <label className={labelClass}>Number of sets</label>
          <div className="flex gap-2">
            {([1, 3, 5] as const).map((n) => {
              const winsNeeded = Math.ceil(n / 2);
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => setNumSets(n)}
                  className={`flex-1 rounded-lg border px-3 py-2.5 text-center transition-colors ${
                    numSets === n
                      ? 'border-brand-500 bg-brand-600/20 text-white'
                      : 'border-slate-600 bg-surface text-slate-400 hover:border-slate-500'
                  }`}
                >
                  <p className="text-sm font-bold">{n} set{n > 1 ? 's' : ''}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">First to {winsNeeded} win{winsNeeded > 1 ? 's' : ''}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Points per set */}
        <div>
          <label className={labelClass}>Points per set</label>
          <div className="flex items-center gap-3">
            <input
              name="points_per_set"
              type="number"
              min={5}
              max={100}
              defaultValue={defaultValues?.points_per_set ?? 11}
              className={`${inputClass} w-28`}
            />
            <p className="text-xs text-slate-500">Points needed to win a set (e.g. 11, 15, 21)</p>
          </div>
        </div>

        {/* Win-by / deuce cap */}
        <WinByDeuceFields
          winBy={winBy}
          deuceCapValue={deuceCap}
          onWinByChange={setWinBy}
          onDeuceCapChange={setDeuceCap}
          size="md"
        />
      </div>

      {/* Auto-approve toggle */}
      <div className="rounded-xl border border-surface-border bg-surface p-4">
        <label className="flex cursor-pointer items-start gap-4">
          <div className="mt-0.5 flex-1">
            <p className="text-sm font-medium text-slate-300">Auto-approve registrations</p>
            <p className="mt-0.5 text-xs text-slate-500">
              When enabled, players who register are immediately added to the draw.
              Disable to manually review and approve each registration.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={autoApprove}
            onClick={() => setAutoApprove(!autoApprove)}
            className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 focus:ring-offset-surface ${
              autoApprove ? 'bg-brand-600' : 'bg-slate-700'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                autoApprove ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </label>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading
          ? mode === 'edit'
            ? 'Saving changes…'
            : 'Creating tournament…'
          : mode === 'edit'
            ? 'Save changes'
            : 'Create tournament'}
      </button>
    </form>
  );
}
