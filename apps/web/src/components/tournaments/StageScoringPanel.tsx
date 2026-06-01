'use client';

/**
 * Per-stage scoring overrides panel — shown in the category edit page.
 * Allows admins to set different scoring rules for group stage, knockout,
 * semifinal, and final within the same category.
 */

import { useState, useTransition } from 'react';
import { upsertStageScoringAction, deleteStageScoringAction } from '@/lib/actions/categories';
import { WinByDeuceFields } from './WinByDeuceFields';
import type { StageScoringRow, StageKey } from '@/lib/actions/categories';

// ── Stage metadata ────────────────────────────────────────────────────────────

const STAGE_META: Record<StageKey, { label: string; description: string; formats: string[] }> = {
  group_stage: {
    label: 'Group Stage',
    description: 'Round-robin group matches',
    formats: ['group_stage_knockout'],
  },
  knockout: {
    label: 'Knockout Rounds',
    description: 'Elimination rounds before semifinals',
    formats: ['single_elimination', 'double_elimination', 'group_stage_knockout'],
  },
  semifinal: {
    label: 'Semifinals',
    description: 'Last four matches',
    formats: ['single_elimination', 'double_elimination', 'group_stage_knockout'],
  },
  final: {
    label: 'Final',
    description: 'Championship match',
    formats: ['single_elimination', 'double_elimination', 'group_stage_knockout'],
  },
};

const ALL_STAGES: StageKey[] = ['group_stage', 'knockout', 'semifinal', 'final'];

const inputClass =
  'block w-full rounded-lg border border-slate-600 bg-surface px-3 py-2 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30';

// ── Stage value chips ─────────────────────────────────────────────────────────

interface ChipProps { label: string; dim?: boolean }

function Chip({ label, dim }: ChipProps) {
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium ${
      dim
        ? 'bg-slate-800/60 text-slate-500'
        : 'bg-slate-700/60 text-slate-300'
    }`}>
      {label}
    </span>
  );
}

function ScoringChips({
  num_sets,
  points_per_set,
  win_by,
  deuce_cap,
  dim = false,
}: {
  num_sets: number;
  points_per_set: number;
  win_by: number;
  deuce_cap: number | null;
  dim?: boolean;
}) {
  const setsLabel = `${num_sets} set${num_sets > 1 ? 's' : ''}`;
  const winLabel = win_by === 1
    ? 'Golden point'
    : deuce_cap
    ? `Deuce → cap ${deuce_cap}`
    : 'Deuce';
  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5">
      <Chip label={`${points_per_set} pts`} dim={dim} />
      <Chip label={setsLabel} dim={dim} />
      <Chip label={winLabel} dim={dim} />
    </div>
  );
}

// ── Single stage row ──────────────────────────────────────────────────────────

interface StageRowProps {
  stage: StageKey;
  existing: StageScoringRow | undefined;
  categoryId: string;
  /** Effective defaults (from category override or tournament) */
  effectiveNumSets: number;
  effectivePointsPerSet: number;
  effectiveWinBy: number;
  effectiveDeuceCap: number | null;
  onSaved: () => void;
}

function StageRow({
  stage,
  existing,
  categoryId,
  effectiveNumSets,
  effectivePointsPerSet,
  effectiveWinBy,
  effectiveDeuceCap,
  onSaved,
}: StageRowProps) {
  const meta = STAGE_META[stage];
  const isOverriding = !!existing;

  const [expanded, setExpanded] = useState(false);
  const [numSets, setNumSets] = useState<1 | 3 | 5>(
    (existing?.num_sets ?? effectiveNumSets) as 1 | 3 | 5,
  );
  const [pointsPerSet, setPointsPerSet] = useState(
    String(existing?.points_per_set ?? effectivePointsPerSet),
  );
  const [winBy, setWinBy] = useState<1 | 2>(
    (existing?.win_by ?? effectiveWinBy) as 1 | 2,
  );
  const [deuceCap, setDeuceCap] = useState(
    existing?.deuce_cap != null
      ? String(existing.deuce_cap)
      : effectiveDeuceCap != null
      ? String(effectiveDeuceCap)
      : '',
  );
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    setMsg(null);
    startTransition(async () => {
      const res = await upsertStageScoringAction(categoryId, stage, {
        num_sets: numSets,
        points_per_set: parseInt(pointsPerSet, 10) || effectivePointsPerSet,
        win_by: winBy,
        deuce_cap: deuceCap ? parseInt(deuceCap, 10) : null,
      });
      if (res.error) {
        setMsg({ text: res.error, ok: false });
      } else {
        setMsg({ text: 'Saved', ok: true });
        setExpanded(false);
        onSaved();
      }
    });
  }

  function handleRemove() {
    startTransition(async () => {
      await deleteStageScoringAction(categoryId, stage);
      onSaved();
    });
  }

  return (
    <div className={`rounded-lg border transition-colors ${
      isOverriding ? 'border-brand-500/40 bg-brand-900/10' : 'border-surface-border bg-surface-card'
    }`}>
      {/* Row header */}
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-white">{meta.label}</p>
            {isOverriding ? (
              <span className="rounded-full bg-brand-600/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-300">
                Custom
              </span>
            ) : (
              <span className="text-[11px] text-slate-500">Inherited</span>
            )}
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">{meta.description}</p>

          {/* Value chips */}
          {isOverriding ? (
            <ScoringChips
              num_sets={existing!.num_sets ?? effectiveNumSets}
              points_per_set={existing!.points_per_set ?? effectivePointsPerSet}
              win_by={existing!.win_by ?? effectiveWinBy}
              deuce_cap={existing!.deuce_cap ?? effectiveDeuceCap}
            />
          ) : (
            <ScoringChips
              num_sets={effectiveNumSets}
              points_per_set={effectivePointsPerSet}
              win_by={effectiveWinBy}
              deuce_cap={effectiveDeuceCap}
              dim
            />
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0 mt-0.5">
          {isOverriding && !expanded && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={isPending}
              className="text-xs text-slate-500 hover:text-red-400 transition-colors"
            >
              Remove
            </button>
          )}
          <button
            type="button"
            onClick={() => { setExpanded((v) => !v); setMsg(null); }}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              expanded
                ? 'bg-surface text-slate-300 border border-slate-700'
                : isOverriding
                ? 'bg-brand-600/20 text-brand-300 hover:bg-brand-600/30'
                : 'border border-surface-border text-slate-300 hover:border-slate-500 hover:text-white'
            }`}
          >
            {expanded ? 'Close' : isOverriding ? 'Edit' : 'Override'}
          </button>
        </div>
      </div>

      {/* Expanded editor */}
      {expanded && (
        <div className="border-t border-surface-border px-4 pb-4 pt-3 space-y-3">
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
              type="number"
              min={5}
              max={100}
              value={pointsPerSet}
              onChange={(e) => setPointsPerSet(e.target.value)}
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

          {msg && (
            <p className={`text-xs ${msg.ok ? 'text-accent-400' : 'text-red-400'}`}>{msg.text}</p>
          )}

          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
            >
              {isPending ? 'Saving…' : 'Save stage rules'}
            </button>
            <button
              type="button"
              onClick={() => { setExpanded(false); setMsg(null); }}
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

interface Props {
  categoryId: string;
  drawFormat: string;
  /** Stage scoring rows already saved in DB */
  initialRows: StageScoringRow[];
  /** Effective defaults to show as inherited values */
  effectiveNumSets: number;
  effectivePointsPerSet: number;
  effectiveWinBy: number;
  effectiveDeuceCap: number | null;
}

export function StageScoringPanel({
  categoryId,
  drawFormat,
  initialRows,
  effectiveNumSets,
  effectivePointsPerSet,
  effectiveWinBy,
  effectiveDeuceCap,
}: Props) {
  const [rows, setRows] = useState<StageScoringRow[]>(initialRows);

  // Only show stages that are applicable to this draw format
  const visibleStages = ALL_STAGES.filter((s) =>
    STAGE_META[s].formats.includes(drawFormat),
  );

  if (visibleStages.length === 0) return null;

  function handleSaved() {
    // Re-fetch rows from server via router.refresh() is handled by revalidatePath.
    // For immediate UI update, we don't re-fetch here — the parent page will
    // reload on next navigation. The row visual updates optimistically via StageRow state.
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-semibold text-white">Stage scoring rules</p>
          <p className="text-xs text-slate-400 mt-0.5">
            Override points, sets, and deuce rules per stage within this category.
          </p>
        </div>
        {rows.length > 0 && (
          <span className="rounded-full bg-brand-600/20 px-2.5 py-0.5 text-[11px] font-semibold text-brand-300">
            {rows.length} override{rows.length > 1 ? 's' : ''}
          </span>
        )}
      </div>
      {visibleStages.map((stage) => (
        <StageRow
          key={stage}
          stage={stage}
          existing={rows.find((r) => r.stage === stage)}
          categoryId={categoryId}
          effectiveNumSets={effectiveNumSets}
          effectivePointsPerSet={effectivePointsPerSet}
          effectiveWinBy={effectiveWinBy}
          effectiveDeuceCap={effectiveDeuceCap}
          onSaved={handleSaved}
        />
      ))}
    </div>
  );
}
