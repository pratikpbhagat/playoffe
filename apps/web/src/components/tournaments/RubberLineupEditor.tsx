'use client';

import type { RosterCompositionRule } from '@pickleball/shared';

const inputClass =
  'block w-full rounded-lg border border-slate-600 bg-surface px-3 py-1.5 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30';

export interface RubberLineupRow {
  sequence: number;
  name: string;
  play_format: 'singles' | 'doubles' | 'mixed_doubles';
}

// ── Rubber lineup ─────────────────────────────────────────────────────────────

export function RubberLineupEditor({ value, onChange }: { value: RubberLineupRow[]; onChange: (v: RubberLineupRow[]) => void }) {
  return (
    <div className="rounded-lg border border-surface-border bg-surface px-4 py-3 space-y-2">
      <p className="text-xs font-semibold text-slate-300">
        Rubber lineup <span className="text-slate-500">(order each tie is played in — same court, back-to-back)</span>
      </p>
      {value.map((r, i) => (
        <div key={r.sequence} className="flex items-center gap-2">
          <span className="w-6 text-xs text-slate-500">{r.sequence}.</span>
          <input
            type="text"
            value={r.name}
            onChange={(e) => {
              const next = [...value];
              next[i] = { ...r, name: e.target.value };
              onChange(next);
            }}
            placeholder={`Rubber ${r.sequence}`}
            maxLength={40}
            className={`${inputClass} flex-1`}
          />
          <select
            value={r.play_format}
            onChange={(e) => {
              const next = [...value];
              next[i] = { ...r, play_format: e.target.value as RubberLineupRow['play_format'] };
              onChange(next);
            }}
            className={`${inputClass} cursor-pointer flex-1`}
          >
            <option value="singles">Singles</option>
            <option value="doubles">Doubles</option>
            <option value="mixed_doubles">Mixed Doubles</option>
          </select>
          <button
            type="button"
            onClick={() => onChange(value.filter((_, j) => j !== i).map((x, j) => ({ ...x, sequence: j + 1 })))}
            disabled={value.length <= 1}
            className="px-2 text-slate-500 hover:text-red-400 disabled:opacity-30 transition-colors"
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...value, { sequence: value.length + 1, name: `Rubber ${value.length + 1}`, play_format: 'singles' }])}
        className="text-xs font-medium text-brand-400 hover:text-brand-300 transition-colors"
      >
        + Add rubber
      </button>
    </div>
  );
}

// ── Roster composition rule ───────────────────────────────────────────────────

export function RosterCompositionEditor({ value, onChange }: { value: RosterCompositionRule[]; onChange: (v: RosterCompositionRule[]) => void }) {
  return (
    <div className="rounded-lg border border-surface-border bg-surface px-4 py-3 space-y-2">
      <p className="text-xs font-semibold text-slate-300">
        Roster composition <span className="text-slate-500">(optional — checked as a soft warning at registration, not enforced)</span>
      </p>
      {value.map((rule, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={50}
            value={rule.count}
            onChange={(e) => {
              const next = [...value];
              next[i] = { ...rule, count: parseInt(e.target.value, 10) || 1 };
              onChange(next);
            }}
            className={`${inputClass} w-16`}
          />
          <select
            value={rule.gender ?? ''}
            onChange={(e) => {
              const next = [...value];
              next[i] = { ...rule, gender: (e.target.value || undefined) as RosterCompositionRule['gender'] };
              onChange(next);
            }}
            className={`${inputClass} cursor-pointer flex-1`}
          >
            <option value="">Any gender</option>
            <option value="male">Men</option>
            <option value="female">Women</option>
          </select>
          <input
            type="number"
            min={0}
            max={120}
            placeholder="Min age"
            value={rule.age_min ?? ''}
            onChange={(e) => {
              const next = [...value];
              next[i] = { ...rule, age_min: e.target.value ? parseInt(e.target.value, 10) : undefined };
              onChange(next);
            }}
            className={`${inputClass} w-24`}
          />
          <input
            type="number"
            min={0}
            max={120}
            placeholder="Max age"
            value={rule.age_max ?? ''}
            onChange={(e) => {
              const next = [...value];
              next[i] = { ...rule, age_max: e.target.value ? parseInt(e.target.value, 10) : undefined };
              onChange(next);
            }}
            className={`${inputClass} w-24`}
          />
          <button
            type="button"
            onClick={() => onChange(value.filter((_, j) => j !== i))}
            className="px-2 text-slate-500 hover:text-red-400 transition-colors"
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...value, { count: 1 }])}
        className="text-xs font-medium text-brand-400 hover:text-brand-300 transition-colors"
      >
        + Add roster rule
      </button>
    </div>
  );
}

// ── Decider format ─────────────────────────────────────────────────────────────

export function DeciderFormatSelect({ value, onChange }: { value: 'singles' | 'doubles' | null; onChange: (v: 'singles' | 'doubles' | null) => void }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-slate-400">
        Decider rubber <span className="text-slate-500">(knockout only — used if the lineup ends tied)</span>
      </p>
      <select
        value={value ?? ''}
        onChange={(e) => onChange((e.target.value || null) as 'singles' | 'doubles' | null)}
        className={`${inputClass} cursor-pointer`}
      >
        <option value="">No decider</option>
        <option value="singles">Singles</option>
        <option value="doubles">Doubles</option>
      </select>
    </div>
  );
}
