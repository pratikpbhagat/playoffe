'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createCategoryAction } from '@/lib/actions/categories';
import { WinByDeuceFields } from './WinByDeuceFields';
import { RubberLineupEditor, RosterCompositionEditor, DeciderFormatSelect } from './RubberLineupEditor';
import { CATEGORY_TYPES, PLAY_FORMATS, DRAW_FORMATS, type RosterCompositionRule } from '@pickleball/shared';
import {
  suggestGroupConfig,
  deriveGroupSize,
  deriveKnockoutTeams,
  deriveBracketSize,
  getKnockoutRoundNames,
  getSuggestedGroupOptions,
} from '@/lib/utils/groupStageConfig';

const inputClass =
  'block w-full rounded-lg border border-slate-600 bg-surface px-3 py-1.5 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30';

const labelClass = 'mb-1 block text-xs font-medium text-slate-400';

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
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Step 1: category basics ────────────────────────────────────────────────
  const [name, setName] = useState('');
  const [categoryType, setCategoryType] = useState<(typeof CATEGORY_TYPES)[number]['value']>('open');
  const [playFormat, setPlayFormat] = useState<(typeof PLAY_FORMATS)[number]['value']>('singles');
  const [drawFormat, setDrawFormat] = useState<(typeof DRAW_FORMATS)[number]['value']>('single_elimination');
  const [rubberLineup, setRubberLineup] = useState<{ sequence: number; name: string; play_format: 'singles' | 'doubles' | 'mixed_doubles' }[]>([
    { sequence: 1, name: 'Rubber 1', play_format: 'singles' },
    { sequence: 2, name: 'Rubber 2', play_format: 'singles' },
    { sequence: 3, name: 'Rubber 3', play_format: 'doubles' },
  ]);
  const [rosterComposition, setRosterComposition] = useState<RosterCompositionRule[]>([]);
  const [deciderFormat, setDeciderFormat] = useState<'singles' | 'doubles' | null>(null);
  const [maxEntries, setMaxEntries] = useState<string>('');
  const [minAge, setMinAge] = useState<string>('');
  const [maxAge, setMaxAge] = useState<string>('');

  // Group stage config
  const [groupsCount, setGroupsCount] = useState<string>('');
  const [advancePerGroup, setAdvancePerGroup] = useState<string>('2');
  const [hasThirdPlaceMatch, setHasThirdPlaceMatch] = useState(false);
  const [knockoutSeeding, setKnockoutSeeding] = useState<'auto' | 'manual'>('auto');
  // Which group index (0-based) gets the extra player when entries don't divide evenly
  const [extraGroupIndex, setExtraGroupIndex] = useState<number>(0);

  // ── Step 2: scoring override ───────────────────────────────────────────────
  const [scoringOverride, setScoringOverride] = useState(false);
  const [scoringFormat, setScoringFormat] = useState<'rally' | 'traditional'>(tournamentScoringFormat);
  const [numSets, setNumSets] = useState<1 | 3 | 5>(tournamentNumSets);
  const [pointsPerSet, setPointsPerSet] = useState<string>(String(tournamentPointsPerSet));
  const [winBy, setWinBy] = useState<1 | 2>(tournamentWinBy);
  const [deuceCap, setDeuceCap] = useState(tournamentDeuceCap != null ? String(tournamentDeuceCap) : '');

  // ── Derived group config ───────────────────────────────────────────────────
  const isGroupStage = drawFormat === 'group_stage_knockout';
  const isTeamEvent = playFormat === 'team_event';
  const maxEntriesNum = parseInt(maxEntries, 10);
  const hasMaxEntries = !isNaN(maxEntriesNum) && maxEntriesNum >= 2;
  const effectiveAdvance = parseInt(advancePerGroup, 10) || 2;
  const suggestedConfig = hasMaxEntries ? suggestGroupConfig(maxEntriesNum, effectiveAdvance) : null;
  const effectiveGroups = groupsCount ? parseInt(groupsCount, 10) : (suggestedConfig?.groupsCount ?? 0);
  const groupSize = (hasMaxEntries && effectiveGroups > 0)
    ? deriveGroupSize(maxEntriesNum, effectiveGroups)
    : 0;
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
    // Put the extra player in the chosen group
    return Array.from({ length: effectiveGroups }, (_, i) =>
      i === extraGroupIndex ? base + remainder : base,
    );
  })();

  function handleMaxEntriesChange(val: string) {
    setMaxEntries(val);
    setGroupsCount('');
    setExtraGroupIndex(0);
  }

  function resetForm() {
    setStep(1);
    setName('');
    setCategoryType('open');
    setPlayFormat('singles');
    setDrawFormat('single_elimination');
    setMaxEntries('');
    setMinAge('');
    setMaxAge('');
    setGroupsCount('');
    setAdvancePerGroup('2');
    setHasThirdPlaceMatch(false);
    setKnockoutSeeding('auto');
    setExtraGroupIndex(0);
    setScoringOverride(false);
    setScoringFormat(tournamentScoringFormat);
    setNumSets(tournamentNumSets);
    setPointsPerSet(String(tournamentPointsPerSet));
    setWinBy(tournamentWinBy);
    setDeuceCap(tournamentDeuceCap != null ? String(tournamentDeuceCap) : '');
    setError(null);
    setLoading(false);
  }

  // Step 1 validation
  function canProceedStep1() {
    if (!name.trim() || name.trim().length < 2) return false;
    if (isGroupStage && !hasMaxEntries) return false;
    if (isTeamEvent && (rubberLineup.length === 0 || rubberLineup.some((r) => !r.name.trim()))) return false;
    return true;
  }

  async function handleSubmit() {
    setError(null);
    setLoading(true);

    const result = await createCategoryAction(tournamentId, {
      name: name.trim(),
      type: categoryType,
      play_format: playFormat,
      draw_format: drawFormat,
      max_entries: maxEntries ? Number(maxEntries) : undefined,
      min_age: minAge ? Number(minAge) : undefined,
      max_age: maxAge ? Number(maxAge) : undefined,
      skill_levels: [],
      rubber_lineup: isTeamEvent ? rubberLineup : [],
      roster_composition: isTeamEvent ? rosterComposition : [],
      decider_format: isTeamEvent ? deciderFormat : null,
      scoring_override: scoringOverride,
      ...(scoringOverride && {
        scoring_format: scoringFormat,
        num_sets: numSets,
        points_per_set: parseInt(pointsPerSet, 10) || tournamentPointsPerSet,
        win_by: winBy,
        deuce_cap: deuceCap ? parseInt(deuceCap, 10) : null,
      }),
      ...(isGroupStage && {
        groups_count: effectiveGroups > 0 ? effectiveGroups : null,
        group_sizes: groupSizes.length > 0 ? groupSizes : null,
        advance_per_group: effectiveAdvance,
        has_third_place_match: hasThirdPlaceMatch,
        knockout_seeding: knockoutTeams >= 2 ? knockoutSeeding : 'auto',
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

  // ── Step indicator ─────────────────────────────────────────────────────────
  const stepLabels = ['Setup', 'Scoring', 'Preview'];
  const stepIndicator = (
    <div className="mb-4 flex items-center gap-0">
      {stepLabels.map((label, i) => {
        const n = (i + 1) as 1 | 2 | 3;
        const done = step > n;
        const active = step === n;
        return (
          <div key={n} className="flex items-center">
            {/* connector line (before first = none) */}
            {i > 0 && (
              <div className={`h-px w-8 sm:w-12 transition-colors ${done || active ? 'bg-brand-500' : 'bg-slate-700'}`} />
            )}
            <button
              type="button"
              onClick={() => done && setStep(n)}
              className={`flex items-center gap-1.5 ${done ? 'cursor-pointer' : 'cursor-default'}`}
            >
              <div className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold transition-colors ${
                active
                  ? 'bg-brand-600 text-white'
                  : done
                    ? 'bg-brand-900 text-brand-400 ring-1 ring-brand-600'
                    : 'bg-slate-800 text-slate-500 ring-1 ring-slate-700'
              }`}>
                {done ? '✓' : n}
              </div>
              <span className={`text-[11px] font-medium hidden sm:block transition-colors ${active ? 'text-white' : done ? 'text-brand-400' : 'text-slate-500'}`}>
                {label}
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );

  // ── Step 1: Category setup ─────────────────────────────────────────────────
  const step1Content = (
    <div className="space-y-3">
      {/* Name */}
      <div>
        <label className={labelClass}>Category name *</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          minLength={2}
          maxLength={80}
          placeholder="e.g. Men's Singles Open"
          className={inputClass}
        />
      </div>

      {/* Type + Play format + Draw format */}
      <div className="grid gap-2 sm:grid-cols-3">
        <div>
          <label className={labelClass}>Type</label>
          <select
            value={categoryType}
            onChange={(e) => setCategoryType(e.target.value as typeof categoryType)}
            className={`${inputClass} cursor-pointer`}
          >
            {CATEGORY_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Play format</label>
          <select
            value={playFormat}
            onChange={(e) => setPlayFormat(e.target.value as typeof playFormat)}
            className={`${inputClass} cursor-pointer`}
          >
            {PLAY_FORMATS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Draw format</label>
          <select
            value={drawFormat}
            onChange={(e) => setDrawFormat(e.target.value as typeof drawFormat)}
            className={`${inputClass} cursor-pointer`}
          >
            {DRAW_FORMATS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Rubber lineup / roster composition / decider — team_event only */}
      {isTeamEvent && (
        <>
          <RubberLineupEditor value={rubberLineup} onChange={setRubberLineup} />
          <RosterCompositionEditor value={rosterComposition} onChange={setRosterComposition} />
          <DeciderFormatSelect value={deciderFormat} onChange={setDeciderFormat} />
        </>
      )}

      {/* Limits */}
      <div className="grid gap-2 sm:grid-cols-3">
        <div>
          <label className={labelClass}>
            Max entries{isGroupStage ? ' *' : ''}
          </label>
          <input
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
          <input
            type="number"
            min={5}
            max={100}
            placeholder="Any"
            value={minAge}
            onChange={(e) => setMinAge(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Max age</label>
          <input
            type="number"
            min={5}
            max={100}
            placeholder="Any"
            value={maxAge}
            onChange={(e) => setMaxAge(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      {/* ── Group stage configuration panel ─────────────────────────────── */}
      {isGroupStage && (
        <GroupStageConfigPanel
          maxEntries={hasMaxEntries ? maxEntriesNum : null}
          suggestedConfig={suggestedConfig}
          allOptions={allOptions}
          groupsCount={groupsCount}
          onGroupsCountChange={(v) => { setGroupsCount(v); setExtraGroupIndex(0); }}
          effectiveGroups={effectiveGroups}
          groupSize={groupSize}
          groupSizes={groupSizes}
          extraGroupIndex={extraGroupIndex}
          onExtraGroupIndexChange={setExtraGroupIndex}
          advancePerGroup={advancePerGroup}
          onAdvancePerGroupChange={(v) => { setAdvancePerGroup(v); setGroupsCount(''); setExtraGroupIndex(0); }}
          knockoutTeams={knockoutTeams}
          knockoutRounds={knockoutRounds}
          knockoutByes={knockoutByes}
          hasThirdPlaceMatch={hasThirdPlaceMatch}
          onHasThirdPlaceMatchChange={setHasThirdPlaceMatch}
          knockoutSeeding={knockoutSeeding}
          onKnockoutSeedingChange={setKnockoutSeeding}
        />
      )}
    </div>
  );

  // ── Step 2: Scoring override ───────────────────────────────────────────────
  const step2Content = (
    <div className="space-y-4">
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
              <input
                type="number"
                min={5}
                max={100}
                value={pointsPerSet}
                onChange={(e) => setPointsPerSet(e.target.value)}
                className={`${inputClass} w-28`}
              />
            </div>
            <WinByDeuceFields winBy={winBy} deuceCapValue={deuceCap} onWinByChange={setWinBy} onDeuceCapChange={setDeuceCap} />
          </div>
        )}
      </div>
    </div>
  );

  // ── Step 3: Preview ────────────────────────────────────────────────────────
  const drawFormatLabel = DRAW_FORMATS.find((f) => f.value === drawFormat)?.label ?? drawFormat;
  const playFormatLabel = PLAY_FORMATS.find((f) => f.value === playFormat)?.label ?? playFormat;
  const categoryTypeLabel = CATEGORY_TYPES.find((t) => t.value === categoryType)?.label ?? categoryType;

  const step3Content = (
    <div className="space-y-4">
      {/* Category summary */}
      <div className="rounded-xl border border-surface-border bg-surface-card p-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Category details</p>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-xs">
          <PreviewRow label="Name" value={name || '—'} highlight />
          <PreviewRow label="Type" value={categoryTypeLabel} />
          <PreviewRow label="Play format" value={playFormatLabel} />
          <PreviewRow label="Draw format" value={drawFormatLabel} />
          {maxEntries && <PreviewRow label="Max entries" value={maxEntries} />}
          {(minAge || maxAge) && (
            <PreviewRow
              label="Age range"
              value={`${minAge || 'Any'} – ${maxAge || 'Any'}`}
            />
          )}
        </div>
      </div>

      {/* Scoring summary */}
      <div className="rounded-xl border border-surface-border bg-surface-card p-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Scoring</p>
        {scoringOverride ? (
          <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-xs">
            <PreviewRow label="Format" value={scoringFormat === 'rally' ? 'Rally scoring' : 'Service points'} />
            <PreviewRow label="Sets" value={`${numSets} set${numSets > 1 ? 's' : ''}`} />
            <PreviewRow label="Points per set" value={pointsPerSet || String(tournamentPointsPerSet)} />
            <PreviewRow label="Win by" value={`${winBy}`} />
            {deuceCap && <PreviewRow label="Deuce cap" value={deuceCap} />}
          </div>
        ) : (
          <p className="text-xs text-slate-400">
            Using tournament default —{' '}
            <span className="text-slate-300">
              {tournamentScoringFormat === 'rally' ? 'Rally scoring' : 'Service points'},{' '}
              {tournamentNumSets} set{tournamentNumSets > 1 ? 's' : ''},{' '}
              {tournamentPointsPerSet} pts
            </span>
          </p>
        )}
      </div>

      {/* Group stage visual */}
      {isGroupStage && effectiveGroups > 0 && (
        <div className="rounded-xl border border-brand-500/20 bg-brand-950/20 p-4 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-300">
            Group stage structure
          </p>

          {/* Groups visual */}
          <div>
            <p className="text-[11px] text-slate-500 mb-2">
              {effectiveGroups} groups · {effectiveAdvance} advance per group
            </p>
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: effectiveGroups }, (_, i) => {
                const gName = String.fromCharCode(65 + i);
                const sz = groupSizes[i] ?? groupSize;
                return (
                  <div key={gName} className="rounded-lg border border-brand-800/40 bg-brand-900/30 px-3 py-2 min-w-[64px]">
                    <p className="text-[11px] font-bold text-brand-300 mb-1">Group {gName}</p>
                    <p className="text-[10px] text-slate-400">{sz} teams</p>
                    <div className="mt-1.5 space-y-0.5">
                      {Array.from({ length: Math.min(sz, 6) }, (_, j) => (
                        <div
                          key={j}
                          className={`h-1.5 rounded-full ${j < effectiveAdvance ? 'bg-brand-500' : 'bg-slate-700'}`}
                        />
                      ))}
                      {sz > 6 && <p className="text-[9px] text-slate-600">+{sz - 6} more</p>}
                    </div>
                    <p className="text-[9px] text-brand-400 mt-1">↑ top {effectiveAdvance}</p>
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-[10px] text-slate-500">
              <span className="inline-block h-1.5 w-4 rounded-full bg-brand-500 mr-1 align-middle" />
              advances to knockout
              <span className="inline-block h-1.5 w-4 rounded-full bg-slate-700 mx-1 ml-3 align-middle" />
              eliminated
            </p>
          </div>

          {/* Knockout flow */}
          {knockoutTeams >= 2 && (
            <div>
              <p className="text-[11px] text-slate-500 mb-2">
                Knockout bracket — {knockoutTeams} teams
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="rounded bg-slate-800 border border-slate-700 px-2 py-0.5 text-[11px] text-slate-400">
                  Group stage
                </span>
                <span className="text-slate-600 text-xs">→</span>
                {knockoutSeeding === 'manual' ? (
                  <span className="rounded bg-brand-900/60 px-2 py-0.5 text-[11px] font-medium text-brand-300 border border-brand-800/40">
                    Knockout Builder ({knockoutTeams} qualifiers, manual pairing)
                  </span>
                ) : (
                  knockoutRounds.map((round, i) => (
                    <span key={round} className="flex items-center gap-1.5">
                      <span className="rounded bg-brand-900/60 px-2 py-0.5 text-[11px] font-medium text-brand-300 border border-brand-800/40">
                        {round}
                      </span>
                      {i < knockoutRounds.length - 1 && (
                        <span className="text-slate-600 text-xs">→</span>
                      )}
                    </span>
                  ))
                )}
              </div>
              {hasThirdPlaceMatch && knockoutSeeding !== 'manual' && (
                <p className="mt-2 text-[11px] text-slate-500">+ 3rd place match (bronze medal)</p>
              )}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-800 bg-red-950 px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}
    </div>
  );

  // ── Nav buttons ────────────────────────────────────────────────────────────
  const navButtons = (
    <div className="flex items-center justify-between">
      <button
        type="button"
        onClick={() => {
          if (step === 1) { resetForm(); setOpen(false); }
          else setStep((s) => (s - 1) as 1 | 2 | 3);
        }}
        className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-400 hover:border-slate-500 hover:text-slate-200 transition-colors"
      >
        {step === 1 ? 'Cancel' : '← Back'}
      </button>

      {step < 3 ? (
        <button
          type="button"
          onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3)}
          disabled={step === 1 && !canProceedStep1()}
          className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Next →
        </button>
      ) : (
        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading}
          className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
        >
          {loading ? 'Saving…' : 'Create category'}
        </button>
      )}
    </div>
  );

  return (
    <>
      {/* Mobile: full-screen overlay — natural page scroll */}
      <div className="fixed inset-0 z-50 overflow-y-auto bg-surface px-5 py-6 sm:hidden">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">New category</h3>
          <button
            onClick={() => { resetForm(); setOpen(false); }}
            className="text-slate-500 hover:text-slate-300 transition-colors text-sm"
          >
            ✕
          </button>
        </div>
        {stepIndicator}
        {step === 1 && step1Content}
        {step === 2 && step2Content}
        {step === 3 && step3Content}
        {navButtons}
      </div>

      {/* Desktop: centered modal — fixed height, pinned header + footer, scrollable body */}
      <div className="hidden sm:flex fixed inset-0 z-50 items-center justify-center p-6">
        <div
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={() => { resetForm(); setOpen(false); }}
        />
        <div className="relative z-10 flex flex-col w-full max-w-2xl h-[90vh] rounded-2xl border border-brand-500/30 bg-surface shadow-2xl">
          {/* Pinned header */}
          <div className="flex-none px-6 pt-6 pb-4 border-b border-surface-border">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-white">New category</h3>
              <button
                onClick={() => { resetForm(); setOpen(false); }}
                className="text-slate-500 hover:text-slate-300 transition-colors text-sm"
              >
                ✕
              </button>
            </div>
            {stepIndicator}
          </div>

          {/* Scrollable step content */}
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
            {step === 1 && step1Content}
            {step === 2 && step2Content}
            {step === 3 && step3Content}
          </div>

          {/* Pinned footer */}
          <div className="flex-none px-6 py-4 border-t border-surface-border">
            {navButtons}
          </div>
        </div>
      </div>
    </>
  );
}

// ── Small helper for preview rows ─────────────────────────────────────────────

function PreviewRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-0.5 font-medium ${highlight ? 'text-white' : 'text-slate-300'}`}>{value}</p>
    </div>
  );
}

// ── Shared group stage configuration panel ────────────────────────────────────

interface GroupStageConfigPanelProps {
  maxEntries: number | null;
  suggestedConfig: { groupsCount: number; groupSize: number } | null;
  allOptions: ReturnType<typeof getSuggestedGroupOptions>;
  groupsCount: string;
  onGroupsCountChange: (v: string) => void;
  effectiveGroups: number;
  groupSize: number;
  groupSizes: number[];
  extraGroupIndex: number;
  onExtraGroupIndexChange: (i: number) => void;
  advancePerGroup: string;
  onAdvancePerGroupChange: (v: string) => void;
  knockoutTeams: number;
  knockoutRounds: string[];
  knockoutByes?: number;
  hasThirdPlaceMatch: boolean;
  onHasThirdPlaceMatchChange: (v: boolean) => void;
  knockoutSeeding?: 'auto' | 'manual';
  onKnockoutSeedingChange?: (v: 'auto' | 'manual') => void;
}

export function GroupStageConfigPanel({
  maxEntries,
  suggestedConfig,
  allOptions,
  groupsCount,
  onGroupsCountChange,
  effectiveGroups,
  groupSize,
  groupSizes,
  extraGroupIndex,
  onExtraGroupIndexChange,
  advancePerGroup,
  onAdvancePerGroupChange,
  knockoutTeams,
  knockoutRounds,
  knockoutByes = 0,
  hasThirdPlaceMatch,
  onHasThirdPlaceMatchChange,
  knockoutSeeding = 'auto',
  onKnockoutSeedingChange,
}: GroupStageConfigPanelProps) {
  const [showStructure, setShowStructure] = useState(false);
  const isOverriding = groupsCount !== '';
  const effectiveAdvance = parseInt(advancePerGroup, 10) || 2;
  const isUneven = maxEntries != null && effectiveGroups > 0 && maxEntries % effectiveGroups !== 0;

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
    <div className="rounded-lg border border-brand-500/20 bg-brand-950/20 px-4 py-3 space-y-3">
      <p className="text-xs font-semibold text-brand-300 uppercase tracking-wide">Group stage configuration</p>

      {/* Advance per group */}
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

      {/* Quick-pick chips for suggested group counts */}
      {allOptions.length > 0 && (
        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-400">
            Number of groups
          </label>
          <div className="flex flex-wrap gap-2 mb-2">
            {allOptions.map((opt) => {
              const selected = effectiveGroups === opt.groupsCount;
              return (
                <button
                  key={opt.groupsCount}
                  type="button"
                  onClick={() => onGroupsCountChange(String(opt.groupsCount))}
                  className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                    selected
                      ? 'border-brand-500 bg-brand-600/20 text-white'
                      : 'border-slate-700 bg-surface text-slate-400 hover:border-slate-600 hover:text-slate-200'
                  }`}
                >
                  <span className="font-semibold">{opt.groupsCount}</span>
                  <span className="ml-1 text-[10px] opacity-70">
                    ({opt.minGroupSize === opt.groupSize ? `${opt.groupSize} each` : `${opt.minGroupSize}–${opt.groupSize}`})
                  </span>
                  {opt.byes === 0 && (
                    <span className="ml-1.5 text-[9px] text-brand-400 font-medium">✓ clean</span>
                  )}
                </button>
              );
            })}
            {/* Custom input */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-slate-600">or</span>
              <input
                type="number"
                min={1}
                max={maxEntries}
                value={isOverriding && !allOptions.find((o) => o.groupsCount === effectiveGroups) ? groupsCount : ''}
                onChange={(e) => onGroupsCountChange(e.target.value)}
                placeholder="custom"
                className="w-20 rounded-lg border border-slate-600 bg-surface px-2 py-1.5 text-xs text-white outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 placeholder:text-slate-600"
              />
            </div>
          </div>
          {effectiveGroups > 0 && groupSize > 0 && (
            <p className="text-[11px] text-slate-500">
              {effectiveGroups} groups · approx {groupSize} players per group
              {maxEntries % effectiveGroups !== 0 && ' (last group may be smaller)'}
            </p>
          )}
        </div>
      )}

      {/* Derived knockout info */}
      {knockoutTeams >= 2 && (
        <div className="rounded-md bg-surface-card px-3 py-2 space-y-2 border border-surface-border">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">Total in knockout</span>
            <span className="text-xs font-semibold text-white">{knockoutTeams} teams</span>
          </div>
          {knockoutSeeding === 'manual' ? (
            <p className="text-[11px] text-slate-500">
              No bracket/byes are generated automatically. After the group stage, you&apos;ll
              manually pair the {knockoutTeams} qualifiers (and every subsequent round) via the
              Knockout Builder.
            </p>
          ) : (
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
          )}
        </div>
      )}

      {/* Extra player assignment — only shown when uneven */}
      {isUneven && effectiveGroups > 0 && (
        <div>
          <p className="text-xs font-medium text-slate-400 mb-1.5">
            Extra player assignment
            <span className="ml-1.5 text-[10px] text-slate-500">
              (entries don't divide evenly — pick which group gets +1)
            </span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: effectiveGroups }, (_, i) => {
              const gName = String.fromCharCode(65 + i);
              const sz = groupSizes[i] ?? groupSize;
              const selected = i === extraGroupIndex;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => onExtraGroupIndexChange(i)}
                  className={`rounded-lg border px-2.5 py-1 text-xs transition-colors ${
                    selected
                      ? 'border-brand-500 bg-brand-600/20 text-white'
                      : 'border-slate-700 bg-surface text-slate-400 hover:border-slate-600 hover:text-slate-200'
                  }`}
                >
                  Group {gName}
                  <span className="ml-1 text-[10px] opacity-60">({sz})</span>
                </button>
              );
            })}
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

      {/* Knockout seeding mode — always available for group-stage knockouts */}
      {knockoutTeams >= 2 && onKnockoutSeedingChange && (
        <div className="rounded-lg border border-amber-800/40 bg-amber-950/20 p-3 space-y-2">
          <p className="text-xs font-medium text-amber-300">
            {knockoutByes > 0
              ? `${knockoutTeams} qualifiers don't fit a clean bracket — ${knockoutByes} bye${knockoutByes !== 1 ? 's' : ''} would occur.`
              : `${knockoutTeams} qualifiers fit a clean bracket — manual seeding is optional here.`}
          </p>
          <label className="flex items-center justify-between gap-3 cursor-pointer">
            <div>
              <span className="text-xs font-medium text-slate-300">
                {knockoutSeeding === 'manual' ? 'Manual seeding' : 'Automatic seeding'}
              </span>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {knockoutSeeding === 'manual'
                  ? "After the group stage, you'll manually pair qualifiers for crossover/playoff matches via the Knockout Builder — no auto-byes."
                  : 'The bracket is generated automatically; top seeds receive byes into the next round.'}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={knockoutSeeding === 'manual'}
              onClick={() => onKnockoutSeedingChange(knockoutSeeding === 'manual' ? 'auto' : 'manual')}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                knockoutSeeding === 'manual' ? 'bg-brand-600' : 'bg-slate-700'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  knockoutSeeding === 'manual' ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </label>
        </div>
      )}

      {/* Inline group structure preview */}
      {effectiveGroups > 0 && knockoutTeams >= 2 && (
        <div>
          <button
            type="button"
            onClick={() => setShowStructure((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 transition-colors"
          >
            <span>{showStructure ? '▾' : '▸'}</span>
            {showStructure ? 'Hide' : 'Show'} group stage structure
          </button>

          {showStructure && (
            <div className="mt-3 space-y-3">
              {/* Group cards */}
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: effectiveGroups }, (_, i) => {
                  const gName = String.fromCharCode(65 + i);
                  const sz = groupSizes[i] ?? groupSize;
                  const isExtra = isUneven && i === extraGroupIndex;
                  return (
                    <div
                      key={gName}
                      className={`rounded-lg border px-3 py-2 min-w-[64px] ${
                        isExtra
                          ? 'border-brand-500/50 bg-brand-900/40'
                          : 'border-brand-800/40 bg-brand-900/30'
                      }`}
                    >
                      <p className="text-[11px] font-bold text-brand-300 mb-1">
                        Group {gName}
                        {isExtra && <span className="ml-1 text-[9px] text-brand-400">+1</span>}
                      </p>
                      <p className="text-[10px] text-slate-400">{sz} teams</p>
                      <div className="mt-1.5 space-y-0.5">
                        {Array.from({ length: Math.min(sz, 6) }, (_, j) => (
                          <div
                            key={j}
                            className={`h-1.5 rounded-full ${j < effectiveAdvance ? 'bg-brand-500' : 'bg-slate-700'}`}
                          />
                        ))}
                        {sz > 6 && <p className="text-[9px] text-slate-600">+{sz - 6} more</p>}
                      </div>
                      <p className="text-[9px] text-brand-400 mt-1">↑ top {effectiveAdvance}</p>
                    </div>
                  );
                })}
              </div>

              {/* Knockout flow */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="rounded bg-slate-800 border border-slate-700 px-2 py-0.5 text-[11px] text-slate-400">
                  Group stage
                </span>
                <span className="text-slate-600 text-xs">→</span>
                {knockoutSeeding === 'manual' ? (
                  <span className="rounded bg-brand-900/60 px-2 py-0.5 text-[11px] font-medium text-brand-300 border border-brand-800/40">
                    Knockout Builder ({knockoutTeams} qualifiers, manual pairing)
                  </span>
                ) : (
                  knockoutRounds.map((round, i) => (
                    <span key={round} className="flex items-center gap-1.5">
                      <span className="rounded bg-brand-900/60 px-2 py-0.5 text-[11px] font-medium text-brand-300 border border-brand-800/40">
                        {round}
                      </span>
                      {i < knockoutRounds.length - 1 && (
                        <span className="text-slate-600 text-xs">→</span>
                      )}
                    </span>
                  ))
                )}
              </div>
              <p className="text-[10px] text-slate-500">
                <span className="inline-block h-1.5 w-4 rounded-full bg-brand-500 mr-1 align-middle" />
                advances · <span className="inline-block h-1.5 w-4 rounded-full bg-slate-700 mx-1 align-middle" /> eliminated
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
