'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { updateCategoryAction } from '@/lib/actions/categories';
import { useRouter } from 'next/navigation';
import { WinByDeuceFields } from './WinByDeuceFields';
import { GroupStageConfigPanel } from './AddCategoryInline';
import { RubberLineupEditor, RosterCompositionEditor, DeciderFormatSelect, type RubberLineupRow } from './RubberLineupEditor';
import { RubberOrderEditor } from './RubberOrderEditor';
import { PLAY_FORMATS as PLAY_FORMAT_OPTS, DRAW_FORMATS as DRAW_FORMAT_OPTS, type RosterCompositionRule } from '@pickleball/shared';
import {
  suggestGroupConfig,
  deriveGroupSize,
  deriveKnockoutTeams,
  deriveBracketSize,
  getKnockoutRoundNames,
  getSuggestedGroupOptions,
} from '@/lib/utils/groupStageConfig';

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
  // Group stage config
  currentGroupsCount: number | null;
  currentAdvancePerGroup: number;
  currentHasThirdPlaceMatch: boolean;
  currentKnockoutSeeding?: 'auto' | 'manual';
  currentRubberLineup?: RubberLineupRow[];
  currentRosterComposition?: RosterCompositionRule[];
  currentDeciderFormat?: 'singles' | 'doubles' | null;
}

const inputClass =
  'block w-full rounded-lg border border-slate-600 bg-surface px-3 py-2 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30';

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
  currentGroupsCount,
  currentAdvancePerGroup,
  currentHasThirdPlaceMatch,
  currentKnockoutSeeding,
  currentRubberLineup,
  currentRosterComposition,
  currentDeciderFormat,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  // Controlled fields
  const [localPlayFormat, setLocalPlayFormat] = useState(currentPlayFormat);
  const [localDrawFormat, setLocalDrawFormat] = useState(currentDrawFormat);
  const [maxEntries, setMaxEntries] = useState(currentMaxEntries != null ? String(currentMaxEntries) : '');
  const [rubberLineup, setRubberLineup] = useState<RubberLineupRow[]>(
    currentRubberLineup && currentRubberLineup.length > 0
      ? currentRubberLineup
      : [{ sequence: 1, name: 'Rubber 1', play_format: 'singles' }],
  );
  const [rosterComposition, setRosterComposition] = useState<RosterCompositionRule[]>(currentRosterComposition ?? []);
  const [deciderFormat, setDeciderFormat] = useState<'singles' | 'doubles' | null>(currentDeciderFormat ?? null);

  // Group stage config state
  const [groupsCount, setGroupsCount] = useState(currentGroupsCount != null ? String(currentGroupsCount) : '');
  const [advancePerGroup, setAdvancePerGroup] = useState(String(currentAdvancePerGroup));
  const [hasThirdPlaceMatch, setHasThirdPlaceMatch] = useState(currentHasThirdPlaceMatch);
  const [knockoutSeeding, setKnockoutSeeding] = useState<'auto' | 'manual'>(currentKnockoutSeeding ?? 'auto');
  const [extraGroupIndex, setExtraGroupIndex] = useState(0);

  // Scoring
  const [scoringOverride, setScoringOverride] = useState(currentScoringOverride);
  const [scoringFormat, setScoringFormat] = useState<'rally' | 'traditional'>(
    currentScoringFormat ?? tournamentScoringFormat,
  );
  const [numSets, setNumSets] = useState<1 | 3 | 5>(currentNumSets ?? tournamentNumSets);
  const [winBy, setWinBy] = useState<1 | 2>(currentWinBy ?? tournamentWinBy);
  const [deuceCap, setDeuceCap] = useState(
    currentDeuceCap != null ? String(currentDeuceCap) : (tournamentDeuceCap != null ? String(tournamentDeuceCap) : ''),
  );

  // Needed for createPortal (SSR guard)
  useEffect(() => { setMounted(true); }, []);

  const isGroupStage = localDrawFormat === 'group_stage_knockout';
  const maxEntriesNum = parseInt(maxEntries, 10);
  const hasMaxEntries = !isNaN(maxEntriesNum) && maxEntriesNum >= 2;

  const effectiveAdvance = parseInt(advancePerGroup, 10) || 2;
  const suggestedConfig = hasMaxEntries ? suggestGroupConfig(maxEntriesNum, effectiveAdvance) : null;
  const effectiveGroups = groupsCount ? parseInt(groupsCount, 10) : (suggestedConfig?.groupsCount ?? 0);
  const groupSize = (hasMaxEntries && effectiveGroups > 0) ? deriveGroupSize(maxEntriesNum, effectiveGroups) : 0;
  const knockoutTeams = effectiveGroups > 0 ? deriveKnockoutTeams(effectiveGroups, effectiveAdvance) : 0;
  const knockoutRounds = knockoutTeams >= 2 ? getKnockoutRoundNames(knockoutTeams) : [];
  const knockoutByes = knockoutTeams >= 2 ? deriveBracketSize(knockoutTeams).byes : 0;
  const allOptions = hasMaxEntries ? getSuggestedGroupOptions(maxEntriesNum, effectiveAdvance) : [];

  // Per-group sizes array — handles uneven distribution
  const groupSizes: number[] = (() => {
    if (!hasMaxEntries || effectiveGroups <= 0) return [];
    const base = Math.floor(maxEntriesNum / effectiveGroups);
    const remainder = maxEntriesNum % effectiveGroups;
    if (remainder === 0) return Array(effectiveGroups).fill(base);
    return Array.from({ length: effectiveGroups }, (_, i) =>
      i === extraGroupIndex ? base + remainder : base,
    );
  })();

  function handleMaxEntriesChange(val: string) {
    setMaxEntries(val);
    // Re-auto-suggest groups when max_entries changes
    if (groupsCount === String(currentGroupsCount ?? '')) setGroupsCount('');
  }

  const closeModal = useCallback(() => {
    setOpen(false);
    setError(null);
  }, []);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeModal();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, closeModal]);

  // Lock body scroll while open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const fd = new FormData(e.currentTarget);

    const result = await updateCategoryAction(categoryId, {
      name: fd.get('name') as string,
      max_entries: maxEntries ? parseInt(maxEntries, 10) : null,
      ...(canEditFormats && {
        play_format: localPlayFormat,
        draw_format: localDrawFormat,
        ...(localPlayFormat === 'team_event' && {
          rubber_lineup: rubberLineup,
          roster_composition: rosterComposition,
          decider_format: deciderFormat,
        }),
      }),
      scoring_override: scoringOverride,
      ...(scoringOverride && {
        scoring_format: scoringFormat,
        num_sets: numSets,
        points_per_set: parseInt(fd.get('points_per_set') as string, 10) || tournamentPointsPerSet,
        win_by: winBy,
        deuce_cap: deuceCap ? parseInt(deuceCap, 10) : null,
      }),
      // Always persist group stage config (server ignores it for non-group formats)
      groups_count: effectiveGroups > 0 ? effectiveGroups : null,
      advance_per_group: effectiveAdvance,
      has_third_place_match: hasThirdPlaceMatch,
      knockout_seeding: knockoutTeams >= 2 ? knockoutSeeding : 'auto',
    });

    setLoading(false);

    if (result?.error) {
      setError(result.error);
    } else {
      closeModal();
      router.refresh();
    }
  }

  // ── Trigger button (always rendered in the header row) ────────────────────
  const trigger = (
    <button
      onClick={() => setOpen(true)}
      className="flex flex-col items-center justify-center rounded-xl bg-surface-card px-4 py-3 ring-1 ring-surface-border hover:ring-brand-500/40 transition-colors text-center min-w-[60px]"
    >
      <span className="text-lg leading-none">✏️</span>
      <span className="mt-1 text-[11px] text-slate-400">Edit</span>
    </button>
  );

  // ── Modal ─────────────────────────────────────────────────────────────────
  const modal = open && mounted ? createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        aria-hidden
        onClick={closeModal}
      />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Edit category"
        className="relative z-10 my-10 w-full max-w-xl rounded-2xl bg-surface-card ring-1 ring-surface-border shadow-2xl mx-4"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-surface-border px-6 py-4">
          <h2 className="text-base font-semibold text-white">Edit category</h2>
          <button
            type="button"
            onClick={closeModal}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-surface hover:text-white transition-colors"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {error && (
            <div className="rounded-lg border border-red-800 bg-red-950 px-3 py-2 text-xs text-red-400">{error}</div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">Name</label>
              <input name="name" type="text" required minLength={2} maxLength={80} defaultValue={currentName} className={inputClass} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">
                Max entries{isGroupStage ? ' *' : ' (blank = unlimited)'}
              </label>
              <input
                name="max_entries"
                type="number"
                min={2}
                max={256}
                required={isGroupStage}
                value={maxEntries}
                onChange={(e) => handleMaxEntriesChange(e.target.value)}
                placeholder={isGroupStage ? 'Required' : 'Unlimited'}
                className={inputClass}
              />
            </div>
          </div>

          {canEditFormats && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-400">Play format</label>
                <select
                  name="play_format"
                  value={localPlayFormat}
                  onChange={(e) => setLocalPlayFormat(e.target.value)}
                  className={`${inputClass} cursor-pointer`}
                >
                  {PLAY_FORMAT_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-400">Draw format</label>
                <select
                  name="draw_format"
                  value={localDrawFormat}
                  onChange={(e) => setLocalDrawFormat(e.target.value)}
                  className={`${inputClass} cursor-pointer`}
                >
                  {DRAW_FORMAT_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* Rubber lineup / roster composition / decider — team_event only, editable until draw generated */}
          {canEditFormats && localPlayFormat === 'team_event' && (
            <>
              <RubberLineupEditor value={rubberLineup} onChange={setRubberLineup} />
              <RosterCompositionEditor value={rosterComposition} onChange={setRosterComposition} />
              <DeciderFormatSelect value={deciderFormat} onChange={setDeciderFormat} />
            </>
          )}

          {/* Post-draw: the lineup itself is locked, but the play order can still change */}
          {!canEditFormats && currentPlayFormat === 'team_event' && (
            <RubberOrderEditor categoryId={categoryId} rubberLineup={rubberLineup} />
          )}

          {/* Group stage configuration panel */}
          {isGroupStage && (
            <GroupStageConfigPanel
              maxEntries={hasMaxEntries ? maxEntriesNum : null}
              suggestedConfig={suggestedConfig}
              allOptions={allOptions}
              groupsCount={groupsCount}
              onGroupsCountChange={(v) => { setGroupsCount(v); }}
              effectiveGroups={effectiveGroups}
              groupSize={groupSize}
              groupSizes={groupSizes}
              extraGroupIndex={extraGroupIndex}
              onExtraGroupIndexChange={setExtraGroupIndex}
              advancePerGroup={advancePerGroup}
              onAdvancePerGroupChange={(v) => { setAdvancePerGroup(v); setGroupsCount(''); }}
              knockoutTeams={knockoutTeams}
              knockoutRounds={knockoutRounds}
              knockoutByes={knockoutByes}
              hasThirdPlaceMatch={hasThirdPlaceMatch}
              onHasThirdPlaceMatchChange={setHasThirdPlaceMatch}
              knockoutSeeding={knockoutSeeding}
              onKnockoutSeedingChange={setKnockoutSeeding}
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
                className={`relative mt-0.5 inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${scoringOverride ? 'bg-brand-600' : 'bg-slate-700'}`}
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
                  <input name="points_per_set" type="number" min={5} max={100} defaultValue={currentPointsPerSet ?? tournamentPointsPerSet} className={`${inputClass} w-28`} />
                </div>
                <WinByDeuceFields winBy={winBy} deuceCapValue={deuceCap} onWinByChange={setWinBy} onDeuceCapChange={setDeuceCap} />
              </div>
            )}
          </div>

          {/* Footer actions */}
          <div className="flex items-center justify-end gap-3 border-t border-surface-border pt-4">
            <button
              type="button"
              onClick={closeModal}
              className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:border-slate-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  ) : null;

  return (
    <>
      {trigger}
      {modal}
    </>
  );
}
