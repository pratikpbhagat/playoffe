'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createCategoryAction } from '@/lib/actions/categories';
import { WinByDeuceFields } from './WinByDeuceFields';
import {
  suggestGroupConfig,
  deriveGroupSize,
  deriveKnockoutTeams,
  getKnockoutRoundNames,
} from '@/lib/utils/groupStageConfig';

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
  tournamentScoringFormat?: 'rally' | 'traditional';
  tournamentNumSets?: 1 | 3 | 5;
  tournamentPointsPerSet?: number;
  tournamentWinBy?: 1 | 2;
  tournamentDeuceCap?: number | null;
}

export function AddCategoryInline({
  tournamentId,
  tournamentScoringFormat = 'rally',
  tournamentNumSets = 1,
  tournamentPointsPerSet = 11,
  tournamentWinBy = 2,
  tournamentDeuceCap = null,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Controlled fields needed for reactive group-stage config panel
  const [drawFormat, setDrawFormat] = useState<string>('single_elimination');
  const [maxEntries, setMaxEntries] = useState<string>('');

  // Group stage config
  const [groupsCount, setGroupsCount] = useState<string>('');
  const [advancePerGroup, setAdvancePerGroup] = useState<string>('2');
  const [hasThirdPlaceMatch, setHasThirdPlaceMatch] = useState(false);

  // Scoring override
  const [scoringOverride, setScoringOverride] = useState(false);
  const [scoringFormat, setScoringFormat] = useState<'rally' | 'traditional'>(tournamentScoringFormat);
  const [numSets, setNumSets] = useState<1 | 3 | 5>(tournamentNumSets);
  const [winBy, setWinBy] = useState<1 | 2>(tournamentWinBy);
  const [deuceCap, setDeuceCap] = useState(tournamentDeuceCap != null ? String(tournamentDeuceCap) : '');

  const isGroupStage = drawFormat === 'group_stage_knockout';
  const maxEntriesNum = parseInt(maxEntries, 10);
  const hasMaxEntries = !isNaN(maxEntriesNum) && maxEntriesNum >= 2;

  // Derived group config (auto-suggest or user override)
  const suggestedConfig = hasMaxEntries ? suggestGroupConfig(maxEntriesNum) : null;
  const effectiveGroups = groupsCount ? parseInt(groupsCount, 10) : (suggestedConfig?.groupsCount ?? 0);
  const effectiveAdvance = parseInt(advancePerGroup, 10) || 2;
  const groupSize = (hasMaxEntries && effectiveGroups > 0)
    ? deriveGroupSize(maxEntriesNum, effectiveGroups)
    : 0;
  const knockoutTeams = effectiveGroups > 0 ? deriveKnockoutTeams(effectiveGroups, effectiveAdvance) : 0;
  const knockoutRounds = knockoutTeams >= 2 ? getKnockoutRoundNames(knockoutTeams) : [];

  // Reset group config when max_entries changes so auto-suggestion re-runs
  function handleMaxEntriesChange(val: string) {
    setMaxEntries(val);
    setGroupsCount(''); // reset override → re-auto-suggest
  }

  function resetForm() {
    setDrawFormat('single_elimination');
    setMaxEntries('');
    setGroupsCount('');
    setAdvancePerGroup('2');
    setHasThirdPlaceMatch(false);
    setScoringOverride(false);
    setScoringFormat(tournamentScoringFormat);
    setNumSets(tournamentNumSets);
    setWinBy(tournamentWinBy);
    setDeuceCap(tournamentDeuceCap != null ? String(tournamentDeuceCap) : '');
    setError(null);
    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const fd = new FormData(e.currentTarget);
    const result = await createCategoryAction(tournamentId, {
      name: fd.get('name') as string,
      type: fd.get('type') as 'skill' | 'age' | 'gender' | 'open',
      play_format: fd.get('play_format') as 'singles' | 'doubles' | 'mixed_doubles',
      draw_format: drawFormat as
        | 'round_robin'
        | 'single_elimination'
        | 'double_elimination'
        | 'group_stage_knockout'
        | 'swiss',
      max_entries: maxEntries ? Number(maxEntries) : undefined,
      min_age: fd.get('min_age') ? Number(fd.get('min_age')) : undefined,
      max_age: fd.get('max_age') ? Number(fd.get('max_age')) : undefined,
      skill_levels: [],
      scoring_override: scoringOverride,
      ...(scoringOverride && {
        scoring_format: scoringFormat,
        num_sets: numSets,
        points_per_set: parseInt(fd.get('points_per_set') as string, 10) || tournamentPointsPerSet,
        win_by: winBy,
        deuce_cap: deuceCap ? parseInt(deuceCap, 10) : null,
      }),
      ...(isGroupStage && {
        groups_count: effectiveGroups > 0 ? effectiveGroups : null,
        advance_per_group: effectiveAdvance,
        has_third_place_match: hasThirdPlaceMatch,
      }),
    });

    if (result.error) {
      setError(result.error);
      setLoading(false);
    } else {
      resetForm();
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

  const formContent = (
    <>
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

        {/* Type + Play format + Draw format */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className={labelClass}>Type</label>
            <select name="type" className={`${inputClass} cursor-pointer`} defaultValue="open">
              {CATEGORY_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Play format</label>
            <select name="play_format" className={`${inputClass} cursor-pointer`} defaultValue="singles">
              {PLAY_FORMATS.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Draw format</label>
            <select
              name="draw_format"
              value={drawFormat}
              onChange={(e) => setDrawFormat(e.target.value)}
              className={`${inputClass} cursor-pointer`}
            >
              {DRAW_FORMATS.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Limits */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className={labelClass}>
              Max entries{isGroupStage ? ' *' : ''}
            </label>
            <input
              name="max_entries"
              type="number"
              min={2}
              max={256}
              required={isGroupStage}
              placeholder={isGroupStage ? 'Required' : 'Unlimited'}
              value={maxEntries}
              onChange={(e) => handleMaxEntriesChange(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Min age</label>
            <input name="min_age" type="number" min={5} max={100} placeholder="Any" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Max age</label>
            <input name="max_age" type="number" min={5} max={100} placeholder="Any" className={inputClass} />
          </div>
        </div>

        {/* ── Group stage configuration panel ─────────────────────────────── */}
        {isGroupStage && (
          <GroupStageConfigPanel
            maxEntries={hasMaxEntries ? maxEntriesNum : null}
            suggestedConfig={suggestedConfig}
            groupsCount={groupsCount}
            onGroupsCountChange={setGroupsCount}
            effectiveGroups={effectiveGroups}
            groupSize={groupSize}
            advancePerGroup={advancePerGroup}
            onAdvancePerGroupChange={setAdvancePerGroup}
            knockoutTeams={knockoutTeams}
            knockoutRounds={knockoutRounds}
            hasThirdPlaceMatch={hasThirdPlaceMatch}
            onHasThirdPlaceMatchChange={setHasThirdPlaceMatch}
          />
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
              <div>
                <p className="mb-1.5 text-[11px] font-medium text-slate-400">Scoring format</p>
                <div className="flex gap-2">
                  {(['rally', 'traditional'] as const).map((v) => (
                    <button key={v} type="button" onClick={() => setScoringFormat(v)}
                      className={`flex-1 rounded border px-2 py-1.5 text-xs transition-colors ${scoringFormat === v ? 'border-brand-500 bg-brand-600/20 text-white' : 'border-slate-700 bg-surface text-slate-400 hover:border-slate-600'}`}>
                      {v === 'rally' ? 'Rally scoring' : 'Service points'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-[11px] font-medium text-slate-400">Number of sets</p>
                <div className="flex gap-2">
                  {([1, 3, 5] as const).map((n) => (
                    <button key={n} type="button" onClick={() => setNumSets(n)}
                      className={`flex-1 rounded border px-2 py-1.5 text-xs transition-colors ${numSets === n ? 'border-brand-500 bg-brand-600/20 text-white' : 'border-slate-700 bg-surface text-slate-400 hover:border-slate-600'}`}>
                      {n} set{n > 1 ? 's' : ''}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-medium text-slate-400">Points per set</label>
                <input name="points_per_set" type="number" min={5} max={100} defaultValue={tournamentPointsPerSet} className={`${inputClass} w-28`} />
              </div>
              <WinByDeuceFields winBy={winBy} deuceCapValue={deuceCap} onWinByChange={setWinBy} onDeuceCapChange={setDeuceCap} />
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <button type="submit" disabled={loading} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-50">
            {loading ? 'Saving…' : 'Save category'}
          </button>
        </div>
      </form>
    </>
  );

  return (
    <>
      {/* Mobile: full-screen overlay so the form isn't squeezed by the parent flex row */}
      <div className="fixed inset-0 z-50 overflow-y-auto bg-surface px-5 py-6 sm:hidden">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">New category</h3>
          <button
            onClick={() => { resetForm(); setOpen(false); }}
            className="text-slate-500 hover:text-slate-300 transition-colors text-sm"
          >
            ✕ Cancel
          </button>
        </div>
        {formContent}
      </div>

      {/* Desktop: inline form below the Categories header row */}
      <div className="hidden sm:block mt-4 rounded-xl border border-brand-500/30 bg-surface p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">New category</h3>
          <button
            onClick={() => { resetForm(); setOpen(false); }}
            className="text-slate-500 hover:text-slate-300 transition-colors text-sm"
          >
            ✕ Cancel
          </button>
        </div>
        {formContent}
      </div>
    </>
  );
}

// ── Shared group stage configuration panel ────────────────────────────────────

interface GroupStageConfigPanelProps {
  maxEntries: number | null;
  suggestedConfig: { groupsCount: number; groupSize: number } | null;
  groupsCount: string;
  onGroupsCountChange: (v: string) => void;
  effectiveGroups: number;
  groupSize: number;
  advancePerGroup: string;
  onAdvancePerGroupChange: (v: string) => void;
  knockoutTeams: number;
  knockoutRounds: string[];
  hasThirdPlaceMatch: boolean;
  onHasThirdPlaceMatchChange: (v: boolean) => void;
}

export function GroupStageConfigPanel({
  maxEntries,
  suggestedConfig,
  groupsCount,
  onGroupsCountChange,
  effectiveGroups,
  groupSize,
  advancePerGroup,
  onAdvancePerGroupChange,
  knockoutTeams,
  knockoutRounds,
  hasThirdPlaceMatch,
  onHasThirdPlaceMatchChange,
}: GroupStageConfigPanelProps) {
  const isOverriding = groupsCount !== '';

  if (!maxEntries) {
    return (
      <div className="rounded-lg border border-amber-800/40 bg-amber-950/20 px-4 py-3">
        <p className="text-xs text-amber-400">
          ↑ Enter max entries above to configure group stage draw settings.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-brand-500/20 bg-brand-950/20 px-4 py-4 space-y-4">
      <p className="text-xs font-semibold text-brand-300 uppercase tracking-wide">Group stage configuration</p>

      {/* Groups count + group size */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-400">
            Number of groups
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={maxEntries}
              value={groupsCount !== '' ? groupsCount : (suggestedConfig?.groupsCount ?? '')}
              onChange={(e) => onGroupsCountChange(e.target.value)}
              placeholder={String(suggestedConfig?.groupsCount ?? '—')}
              className="w-20 rounded-lg border border-slate-600 bg-surface px-3 py-1.5 text-sm text-white outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
            />
            {!isOverriding && suggestedConfig && (
              <span className="text-[11px] text-slate-500">auto from {maxEntries} ÷ {suggestedConfig.groupSize}</span>
            )}
          </div>
          {effectiveGroups > 0 && groupSize > 0 && (
            <p className="mt-1.5 text-[11px] text-slate-500">
              {effectiveGroups} groups · {groupSize} players per group
              {maxEntries % effectiveGroups !== 0 && ' (last group may be smaller)'}
            </p>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-400">
            Advance per group
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={groupSize > 0 ? groupSize - 1 : 10}
              value={advancePerGroup}
              onChange={(e) => onAdvancePerGroupChange(e.target.value)}
              className="w-20 rounded-lg border border-slate-600 bg-surface px-3 py-1.5 text-sm text-white outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
            />
            <span className="text-[11px] text-slate-500">players advance to knockout</span>
          </div>
        </div>
      </div>

      {/* Derived knockout info */}
      {knockoutTeams >= 2 && (
        <div className="rounded-md bg-surface-card px-3 py-3 space-y-2 border border-surface-border">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">Total in knockout</span>
            <span className="text-xs font-semibold text-white">{knockoutTeams} teams</span>
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-1.5">Knockout bracket</p>
            <div className="flex flex-wrap items-center gap-1.5">
              {knockoutRounds.map((round, i) => (
                <span key={round} className="flex items-center gap-1.5">
                  <span className="rounded bg-brand-900/60 px-2 py-0.5 text-[11px] font-medium text-brand-300 border border-brand-800/40">
                    {round}
                  </span>
                  {i < knockoutRounds.length - 1 && (
                    <span className="text-slate-600 text-xs">→</span>
                  )}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 3rd place match */}
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={hasThirdPlaceMatch}
          onChange={(e) => onHasThirdPlaceMatchChange(e.target.checked)}
          className="h-4 w-4 rounded border-slate-600 bg-surface accent-brand-500"
        />
        <div>
          <span className="text-xs font-medium text-slate-300">3rd place match</span>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Semi-final losers play a bronze medal match.
          </p>
        </div>
      </label>
    </div>
  );
}
