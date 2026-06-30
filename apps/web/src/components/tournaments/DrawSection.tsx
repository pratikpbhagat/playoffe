'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { generateDrawAction, clearDrawAction, generateNextSwissRoundAction, promoteGroupWinnersAction, resetKnockoutBracketAction, swapDrawEntriesAction, replaceDrawEntryAction } from '@/lib/actions/draws';
import { updateCategoryAction } from '@/lib/actions/categories';
import { getKnockoutRoundNames, deriveKnockoutTeams } from '@/lib/utils/groupStageConfig';
import { shareDrawOnSocialAction } from '@/lib/actions/social';
import { useToast } from '@/components/ui/ToastProvider';
import type { MatchWithPlayers } from '@/lib/actions/draws';
import { BracketView } from './BracketView';
import { useRealtimeCategoryMatches } from '@/hooks/useRealtimeCategoryMatches';
import { StandingsTable } from './StandingsTable';
import { DRAW_FORMATS } from '@pickleball/shared';

interface StalenessEntry {
  id: string;
  name: string;
}

interface Props {
  categoryId: string;
  categorySlug?: string;
  tournamentSlug: string;
  drawFormat: string;
  categoryStatus: string;
  entryCount: number;
  initialMatches: MatchWithPlayers[];
  /** team_event categories use ties (not individual matches) for bracket/standings
   *  display — handled separately by the caller (TeamBracketView/TeamStandingsTable),
   *  so this component suppresses its own BracketView/StandingsTable in that case. */
  playFormat?: string;
  showBracket?: boolean;   // when false, hides BracketView (default true)
  showStandings?: boolean; // when false, hides StandingsTable (default true)
  readOnly?: boolean;      // when true, match tiles in BracketView are non-clickable
  /** When true: shows "Share draw on social" button (requires organiser flag + connected club accounts) */
  shareOnSocialEnabled?: boolean;
  /** Entries that are out of sync with the draw (withdrawn-in-draw + active-but-unplaced) */
  stalenessInfo?: {
    withdrawnInDraw: StalenessEntry[];
    unplacedActive: StalenessEntry[];
  };
  /** Group stage config — required for group_stage_knockout to show the pre-generate preview */
  groupStageConfig?: {
    groupsCount: number | null;
    advancePerGroup: number;
    hasThirdPlaceMatch: boolean;
    knockoutSeeding?: 'auto' | 'manual';
  };
}

const FORMAT_LABEL: Record<string, string> = Object.fromEntries(
  DRAW_FORMATS.map((f) => [f.value, f.label]),
);

export function DrawSection({
  categoryId,
  categorySlug,
  tournamentSlug,
  drawFormat,
  categoryStatus,
  entryCount,
  initialMatches,
  playFormat,
  showBracket = true,
  showStandings = true,
  readOnly = false,
  shareOnSocialEnabled = false,
  stalenessInfo,
  groupStageConfig,
}: Props) {
  const router    = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [generatingSwissRound, setGeneratingSwissRound] = useState(false);
  const [promotingGroups, setPromotingGroups] = useState(false);
  const [resettingKnockout, setResettingKnockout] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRegenConfirm, setShowRegenConfirm] = useState(false);
  const [matches, setMatches] = useState(initialMatches);

  // `router.refresh()` only *schedules* a re-fetch of server data — it doesn't
  // wait for the new props to land, so flipping a loading flag back off right
  // after calling it turns the spinner off well before the bracket actually
  // reappears, producing a "nothing happened, then the page jumps" effect.
  // Instead, every loading flag below is cleared only once `initialMatches`
  // itself changes (i.e. the server component actually re-rendered with the
  // new data) — and since the bracket/groups always start from the top of the
  // section, we scroll back to the top at the same moment rather than trying
  // to preserve an arbitrary mid-generation scroll position.
  const scrollToTopOnLoad = useRef(false);
  useEffect(() => {
    setMatches(initialMatches);
    setLoading(false);
    setGeneratingSwissRound(false);
    setPromotingGroups(false);
    setResettingKnockout(false);
    if (scrollToTopOnLoad.current) {
      scrollToTopOnLoad.current = false;
      requestAnimationFrame(() => window.scrollTo({ top: 0 }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMatches]);

  // ── Group stage draw preview (before generating) ─────────────────────────
  const [showDrawPreview, setShowDrawPreview] = useState(false);
  const [extraGroupIndex, setExtraGroupIndex] = useState(0);

  const isGroupStage = drawFormat === 'group_stage_knockout';
  const gsGroupsCount = groupStageConfig?.groupsCount ?? null;
  const gsAdvance = groupStageConfig?.advancePerGroup ?? 2;

  // Compute actual group sizes from live entryCount (not max_entries)
  const gsGroupSizes: number[] = (() => {
    if (!isGroupStage || !gsGroupsCount || gsGroupsCount < 1 || entryCount < 2) return [];
    const base = Math.floor(entryCount / gsGroupsCount);
    const remainder = entryCount % gsGroupsCount;
    if (remainder === 0) return Array(gsGroupsCount).fill(base);
    return Array.from({ length: gsGroupsCount }, (_, i) =>
      i === extraGroupIndex ? base + remainder : base,
    );
  })();
  const gsKnockoutTeams = gsGroupsCount ? deriveKnockoutTeams(gsGroupsCount, gsAdvance) : 0;
  const gsKnockoutRounds = gsKnockoutTeams >= 2 ? getKnockoutRoundNames(gsKnockoutTeams) : [];
  const gsIsUneven = gsGroupsCount !== null && entryCount % gsGroupsCount !== 0;

  // ── Knockout seeding mode (auto vs manual) — editable from the draw preview ──
  const [localKnockoutSeeding, setLocalKnockoutSeeding] = useState<'auto' | 'manual'>(
    groupStageConfig?.knockoutSeeding ?? 'auto',
  );
  const [savingKnockoutSeeding, setSavingKnockoutSeeding] = useState(false);

  useEffect(() => {
    setLocalKnockoutSeeding(groupStageConfig?.knockoutSeeding ?? 'auto');
  }, [groupStageConfig?.knockoutSeeding]);

  async function handleKnockoutSeedingToggle() {
    const next = localKnockoutSeeding === 'manual' ? 'auto' : 'manual';
    setLocalKnockoutSeeding(next);
    setSavingKnockoutSeeding(true);
    const result = await updateCategoryAction(categoryId, { knockout_seeding: next });
    if (result?.error) {
      setLocalKnockoutSeeding(localKnockoutSeeding);
      toast(result.error, 'error');
    } else {
      router.refresh();
    }
    setSavingKnockoutSeeding(false);
  }

  // ── Replace-entry state ──────────────────────────────────────────────────────
  const [replaceFrom, setReplaceFrom] = useState('');
  const [replaceTo, setReplaceTo] = useState('');
  const [replacing, setReplacing] = useState(false);
  const [replaceError, setReplaceError] = useState<string | null>(null);

  // ── Share-draw-on-social state ────────────────────────────────────────────────
  const [sharing, setSharing] = useState(false);

  async function handleShareDraw() {
    setSharing(true);
    const result = await shareDrawOnSocialAction(categoryId);
    if (result.error) {
      toast(result.error, 'error');
    } else {
      toast('Draw shared on social! 🎉', 'success');
    }
    setSharing(false);
  }

  // ── Swap / adjust-draw state ─────────────────────────────────────────────────
  const [adjustMode, setAdjustMode] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<{ id: string; name: string } | null>(null);
  const [pendingSwap, setPendingSwap] = useState<{
    id1: string; name1: string; id2: string; name2: string;
  } | null>(null);
  const [swapping, setSwapping] = useState(false);
  const [swapError, setSwapError] = useState<string | null>(null);
  const [showAdjustWarning, setShowAdjustWarning] = useState(false);

  // (matches sync + loading-flag clearing for this prop change is handled by
  // the effect declared near the top of the component, alongside scrollY restore)

  // Auto-populate replace dropdowns when staleness data changes (e.g. after router.refresh)
  useEffect(() => {
    setReplaceFrom(
      (stalenessInfo?.withdrawnInDraw.length ?? 0) >= 1
        ? (stalenessInfo?.withdrawnInDraw[0]?.id ?? '')
        : '',
    );
    setReplaceTo(
      (stalenessInfo?.unplacedActive.length ?? 0) >= 1
        ? (stalenessInfo?.unplacedActive[0]?.id ?? '')
        : '',
    );
    setReplaceError(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMatches]); // Re-sync whenever the server refreshes match data

  async function handleReplace() {
    if (!replaceFrom || !replaceTo) return;
    setReplacing(true);
    setReplaceError(null);
    const result = await replaceDrawEntryAction(categoryId, replaceFrom, replaceTo);
    if ('error' in result && result.error) {
      setReplaceError(result.error);
    } else {
      router.refresh();
    }
    setReplacing(false);
  }

  const isDrawn = categoryStatus === 'draw_generated' || categoryStatus === 'in_progress' || categoryStatus === 'completed';

  // Swiss next-round logic
  const isSwiss = drawFormat === 'swiss';
  const maxRound = matches.length > 0 ? Math.max(...matches.map((m) => m.round)) : 0;
  const currentRoundComplete =
    maxRound > 0 &&
    matches
      .filter((m) => m.round === maxRound)
      .every((m) => m.status === 'completed' || m.status === 'walkover');
  const totalSwissRounds = Math.ceil(Math.log2(Math.max(entryCount, 2)));
  const canGenerateNextSwissRound =
    isSwiss && isDrawn && currentRoundComplete && maxRound < totalSwissRounds;

  // Group stage knockout: can promote when all group matches are done and knockouts unfilled
  const isGroupKnockout = drawFormat === 'group_stage_knockout';
  const groupMatches = matches.filter((m) => m.group_name !== null);
  const knockoutMatches = matches.filter((m) => m.group_name === null);
  const allGroupMatchesDone =
    groupMatches.length > 0 &&
    groupMatches.every((m) => m.status === 'completed' || m.status === 'walkover');
  // Only the first knockout round is filled by "Promote group winners" — once
  // those slots are populated, the button should stay hidden even though later
  // rounds (semis, final) still have empty placeholder slots.
  const firstKnockoutRound = knockoutMatches.length > 0
    ? Math.min(...knockoutMatches.map((m) => m.round))
    : null;
  const firstRoundKnockoutMatches = knockoutMatches.filter((m) => m.round === firstKnockoutRound);
  const knockoutSlotsEmpty = firstRoundKnockoutMatches.every((m) => !m.entry_a && !m.entry_b);
  const knockoutSeeding = localKnockoutSeeding;
  const canPromoteGroups =
    isGroupKnockout && isDrawn && allGroupMatchesDone && knockoutMatches.length > 0
    && knockoutSlotsEmpty && knockoutSeeding === 'auto';
  const showKnockoutBuilderLink = isGroupKnockout && isDrawn && allGroupMatchesDone && knockoutSeeding === 'manual';

  // Knockout bracket can be (re)built from group standings as long as no
  // knockout match has started yet — covers both "no bracket exists" and
  // "bracket already filled but needs to be redone" cases.
  const knockoutNotStarted = knockoutMatches.every((m) => m.status === 'scheduled');
  const canResetKnockout =
    isGroupKnockout && isDrawn && allGroupMatchesDone && knockoutSeeding === 'auto' && knockoutNotStarted;

  async function handlePromoteGroups() {
    setPromotingGroups(true);
    setError(null);
    scrollToTopOnLoad.current = true;
    const result = await promoteGroupWinnersAction(categoryId);
    if ('error' in result && result.error) {
      setError(result.error);
      setPromotingGroups(false);
      scrollToTopOnLoad.current = false;
    } else {
      // Loading flag is cleared once `initialMatches` actually updates — see effect above.
      router.refresh();
    }
  }

  async function handleResetKnockout() {
    setResettingKnockout(true);
    setError(null);
    scrollToTopOnLoad.current = true;
    const result = await resetKnockoutBracketAction(categoryId);
    if ('error' in result && result.error) {
      setError(result.error);
      setResettingKnockout(false);
      scrollToTopOnLoad.current = false;
    } else {
      router.refresh();
    }
  }

  // True once any match has moved past 'scheduled' — blocks regeneration
  const anyMatchStarted = matches.some(
    (m) => m.status !== 'scheduled',
  );

  // Can adjust: draw exists, category not completed, not swiss
  const canAdjust =
    isDrawn &&
    categoryStatus !== 'completed' &&
    drawFormat !== 'swiss' &&
    matches.length > 0 &&
    !readOnly;

  function handleAdjustClick() {
    if (anyMatchStarted) {
      setShowAdjustWarning(true);
    } else {
      setAdjustMode(true);
    }
  }

  function handleEntryClick(entryId: string, entryName: string) {
    setSwapError(null);
    if (!selectedEntry) {
      setSelectedEntry({ id: entryId, name: entryName });
    } else if (selectedEntry.id === entryId) {
      // Clicking the same entry deselects it
      setSelectedEntry(null);
    } else {
      // Second entry selected → queue for confirmation
      setPendingSwap({ id1: selectedEntry.id, name1: selectedEntry.name, id2: entryId, name2: entryName });
      setSelectedEntry(null);
    }
  }

  async function handleConfirmSwap() {
    if (!pendingSwap) return;
    setSwapping(true);
    setSwapError(null);
    const result = await swapDrawEntriesAction(categoryId, pendingSwap.id1, pendingSwap.id2);
    if ('error' in result && result.error) {
      setSwapError(result.error);
    } else {
      setPendingSwap(null);
      router.refresh();
    }
    setSwapping(false);
  }

  function exitAdjustMode() {
    setAdjustMode(false);
    setSelectedEntry(null);
    setPendingSwap(null);
    setSwapError(null);
  }

  // Live subscription — auto-refreshes bracket when any match in this category changes
  const liveStatus = useRealtimeCategoryMatches(categoryId);

  function handleGenerate() {
    // For group stage: show the preview panel first so the organiser can confirm
    // the group structure based on the actual (live) entry count.
    if (isGroupStage && gsGroupsCount) {
      setShowDrawPreview(true);
      return;
    }
    void handleGenerateConfirmed();
  }

  async function handleGenerateConfirmed(sizes?: number[]) {
    setShowDrawPreview(false);
    setLoading(true);
    setError(null);
    scrollToTopOnLoad.current = true;
    const result = await generateDrawAction(categoryId, sizes);
    if (result.error) {
      setError(result.error);
      setLoading(false);
      scrollToTopOnLoad.current = false;
    } else {
      // Loading flag is cleared once `initialMatches` actually updates — see effect above.
      router.refresh();
    }
  }

  async function handleClear() {
    setShowRegenConfirm(false);
    setLoading(true);
    setError(null);
    scrollToTopOnLoad.current = true;
    await clearDrawAction(categoryId);
    router.refresh();
  }

  async function handleGenerateNextSwissRound() {
    setGeneratingSwissRound(true);
    setError(null);
    scrollToTopOnLoad.current = true;
    const result = await generateNextSwissRoundAction(categoryId);
    if ('error' in result && result.error) {
      setError(result.error);
      setGeneratingSwissRound(false);
      scrollToTopOnLoad.current = false;
    } else {
      router.refresh();
    }
  }

  return (
    <section className={pendingSwap ? 'pb-24' : ''}>
      {/* Section header */}
      <div className="mb-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Draw</h2>
            {/* Live indicator — only meaningful once a draw exists */}
            {isDrawn && (
              <span
                title={
                  liveStatus === 'live'
                    ? 'Live — updates automatically'
                    : liveStatus === 'connecting' || liveStatus === 'reconnecting'
                      ? 'Connecting…'
                      : 'Offline — reload to reconnect'
                }
                className={`h-1.5 w-1.5 rounded-full ${
                  liveStatus === 'live'
                    ? 'bg-accent-400 animate-pulse'
                    : liveStatus === 'connecting' || liveStatus === 'reconnecting'
                      ? 'bg-yellow-500 animate-pulse'
                      : 'bg-red-500'
                }`}
              />
            )}
          </div>
          <p className="mt-0.5 text-xs text-slate-600">{FORMAT_LABEL[drawFormat] ?? drawFormat}</p>
          {readOnly && isDrawn && (
            <p className="mt-1 text-xs text-slate-500">
              To assign referees and start scoring, use the{' '}
              <span className="text-slate-400 font-medium">🎾 Scoring</span> button above.
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {isDrawn ? (
            <>
              {/* Match count chip */}
              <span className="rounded-full bg-surface-card px-3 py-1 text-xs text-slate-400 ring-1 ring-surface-border">
                {matches.length} match{matches.length !== 1 ? 'es' : ''}
              </span>

              {adjustMode ? (
                /* ── Adjust mode active: only show "Done" ── */
                <button
                  onClick={exitAdjustMode}
                  className="rounded-lg bg-amber-600/20 border border-amber-600/50 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-600/30 transition-colors"
                >
                  ✓ Done adjusting
                </button>
              ) : (
                <>
                  {/* Adjust draw button */}
                  {canAdjust && !showRegenConfirm && (
                    <button
                      onClick={handleAdjustClick}
                      className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-300 hover:border-amber-500 hover:text-amber-400 transition-colors"
                    >
                      ✏️ Adjust draw
                    </button>
                  )}

                  {/* Share draw on social — shown when organiser flag is enabled + club has connections */}
                  {shareOnSocialEnabled && !showRegenConfirm && !adjustMode && (
                    <button
                      onClick={handleShareDraw}
                      disabled={sharing}
                      title="Post a 'Draw is live' announcement to the club's social media pages"
                      className="rounded-lg border border-brand-700/50 px-3 py-1.5 text-xs text-brand-400 hover:bg-brand-700/10 transition-colors disabled:opacity-50"
                    >
                      {sharing ? 'Sharing…' : '📢 Share on social'}
                    </button>
                  )}

                  {/* Swiss: generate next round */}
                  {canGenerateNextSwissRound && !showRegenConfirm && (
                    <button
                      onClick={handleGenerateNextSwissRound}
                      disabled={generatingSwissRound}
                      className="rounded-lg border border-brand-600 px-3 py-1.5 text-xs text-brand-400 hover:bg-brand-600/10 transition-colors disabled:opacity-50"
                    >
                      {generatingSwissRound ? 'Generating…' : `Generate Round ${maxRound + 1}`}
                    </button>
                  )}

                  {/* Group stage knockout: promote group winners to knockout bracket */}
                  {canPromoteGroups && !showRegenConfirm && (
                    <button
                      onClick={handlePromoteGroups}
                      disabled={promotingGroups}
                      className="rounded-lg border border-brand-600 px-3 py-1.5 text-xs text-brand-400 hover:bg-brand-600/10 transition-colors disabled:opacity-50"
                    >
                      {promotingGroups ? 'Promoting…' : 'Promote group winners →'}
                    </button>
                  )}

                  {/* Group stage knockout: clear/rebuild empty knockout slots */}
                  {canResetKnockout && !showRegenConfirm && (
                    <button
                      onClick={handleResetKnockout}
                      disabled={resettingKnockout}
                      title="Clear the knockout-stage matches and rebuild empty bracket slots from group standings"
                      className="rounded-lg border border-surface-border px-3 py-1.5 text-xs text-slate-400 hover:bg-surface-border/30 transition-colors disabled:opacity-50"
                    >
                      {resettingKnockout ? 'Resetting…' : 'Reset knockout bracket ↺'}
                    </button>
                  )}

                  {/* Group stage knockout (manual seeding): open the knockout builder */}
                  {showKnockoutBuilderLink && !showRegenConfirm && (
                    <Link
                      href={`/tournaments/${tournamentSlug}/categories/${categorySlug ?? categoryId}/knockout-builder`}
                      className="rounded-lg border border-brand-600 px-3 py-1.5 text-xs text-brand-400 hover:bg-brand-600/10 transition-colors"
                    >
                      Open Knockout Builder →
                    </Link>
                  )}

                  {categoryStatus === 'draw_generated' && !showRegenConfirm && !anyMatchStarted && (
                    <button
                      onClick={() => setShowRegenConfirm(true)}
                      className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-300 hover:border-red-600 hover:text-red-400 transition-colors"
                    >
                      Regenerate
                    </button>
                  )}

                  {showRegenConfirm && !anyMatchStarted && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-red-400">Delete existing draw?</span>
                      <button
                        onClick={handleClear}
                        disabled={loading}
                        className="rounded-lg bg-red-900/40 px-3 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-900/60 transition-colors disabled:opacity-50"
                      >
                        {loading ? '…' : 'Yes, regenerate'}
                      </button>
                      <button
                        onClick={() => setShowRegenConfirm(false)}
                        className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </>
              )}
            </>
          ) : (
            <button
              onClick={handleGenerate}
              disabled={loading || entryCount < 2}
              title={entryCount < 2 ? 'Need at least 2 entries' : undefined}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'Generating…' : 'Generate draw'}
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-lg border border-red-800 bg-red-950 px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}

      {/* ── Draw staleness banner ────────────────────────────────────────── */}
      {isDrawn && !readOnly && stalenessInfo &&
        (stalenessInfo.withdrawnInDraw.length > 0 || stalenessInfo.unplacedActive.length > 0) && (
        <div className="mb-4 rounded-lg border border-amber-700/50 bg-amber-950/40 px-4 py-3 space-y-3">
          <div className="flex items-start gap-2">
            <span className="text-amber-400 text-sm shrink-0 mt-0.5">⚠️</span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-200">Draw is out of sync</p>
              <p className="mt-0.5 text-xs text-amber-400/80">
                {stalenessInfo.withdrawnInDraw.length > 0 && (
                  <span>
                    {stalenessInfo.withdrawnInDraw.length} entr{stalenessInfo.withdrawnInDraw.length === 1 ? 'y' : 'ies'} withdrawn from the draw
                    {stalenessInfo.unplacedActive.length > 0 && ' · '}
                  </span>
                )}
                {stalenessInfo.unplacedActive.length > 0 && (
                  <span>
                    {stalenessInfo.unplacedActive.length} new entr{stalenessInfo.unplacedActive.length === 1 ? 'y' : 'ies'} not yet placed
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Replace UI — shown only when both lists are non-empty */}
          {stalenessInfo.withdrawnInDraw.length > 0 && stalenessInfo.unplacedActive.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-amber-300/70 shrink-0">Replace</span>
                <select
                  value={replaceFrom}
                  onChange={(e) => setReplaceFrom(e.target.value)}
                  className="flex-1 min-w-[140px] rounded-lg border border-amber-700/40 bg-surface px-2 py-1.5 text-xs text-white outline-none focus:border-amber-500 cursor-pointer"
                >
                  <option value="">Select withdrawn entry…</option>
                  {stalenessInfo.withdrawnInDraw.map((e) => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
                <span className="text-xs text-amber-300/70 shrink-0">with</span>
                <select
                  value={replaceTo}
                  onChange={(e) => setReplaceTo(e.target.value)}
                  className="flex-1 min-w-[140px] rounded-lg border border-amber-700/40 bg-surface px-2 py-1.5 text-xs text-white outline-none focus:border-amber-500 cursor-pointer"
                >
                  <option value="">Select new entry…</option>
                  {stalenessInfo.unplacedActive.map((e) => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
                <button
                  onClick={handleReplace}
                  disabled={!replaceFrom || !replaceTo || replacing}
                  className="rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-semibold text-amber-100 hover:bg-amber-600 transition-colors disabled:opacity-40"
                >
                  {replacing ? 'Replacing…' : 'Replace →'}
                </button>
              </div>
              {replaceError && (
                <p className="text-xs text-red-400">{replaceError}</p>
              )}
              {!anyMatchStarted && (
                <p className="text-xs text-amber-500/60">
                  Or{' '}
                  <button
                    onClick={() => setShowRegenConfirm(true)}
                    className="underline hover:text-amber-400 transition-colors"
                  >
                    regenerate the draw
                  </button>{' '}
                  to rebuild the bracket from all current active entries.
                </p>
              )}
            </div>
          )}

          {/* Only withdrawn entries — no new entry available to slot in */}
          {stalenessInfo.withdrawnInDraw.length > 0 && stalenessInfo.unplacedActive.length === 0 && (
            <p className="text-xs text-amber-400/70">
              Withdrawn {stalenessInfo.withdrawnInDraw.length === 1 ? 'entry remains' : 'entries remain'} in the bracket.{' '}
              {anyMatchStarted
                ? 'Use Adjust draw to swap them out manually.'
                : <><button onClick={() => setShowRegenConfirm(true)} className="underline hover:text-amber-300 transition-colors">Regenerate the draw</button>{' '}to remove {stalenessInfo.withdrawnInDraw.length === 1 ? 'it' : 'them'}.</>}
            </p>
          )}

          {/* Only new entries — nothing withdrawn to replace */}
          {stalenessInfo.withdrawnInDraw.length === 0 && stalenessInfo.unplacedActive.length > 0 && (
            <p className="text-xs text-amber-400/70">
              {stalenessInfo.unplacedActive.length} new entr{stalenessInfo.unplacedActive.length === 1 ? 'y is' : 'ies are'} not in the draw.{' '}
              {anyMatchStarted
                ? 'Use Adjust draw to place them manually.'
                : <><button onClick={() => setShowRegenConfirm(true)} className="underline hover:text-amber-300 transition-colors">Regenerate the draw</button>{' '}to include {stalenessInfo.unplacedActive.length === 1 ? 'it' : 'them'}.</>}
            </p>
          )}
        </div>
      )}

      {/* ── Adjust-draw warning: matches already started/completed ───────── */}
      {showAdjustWarning && (
        <div className="mb-4 rounded-lg border border-amber-700/50 bg-amber-950/40 px-4 py-3 space-y-2">
          <p className="text-sm font-semibold text-amber-200">⚠️ Some matches have already started or been completed</p>
          <p className="text-xs text-amber-400/80">
            Adjusting the draw now may change matchups for matches that have already been played or are in progress.
            Are you sure you want to continue?
          </p>
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => { setShowAdjustWarning(false); setAdjustMode(true); }}
              className="rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-semibold text-amber-100 hover:bg-amber-600 transition-colors"
            >
              Yes, adjust draw
            </button>
            <button
              onClick={() => setShowAdjustWarning(false)}
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Adjust-mode instruction banner (top) ────────────────────────── */}
      {adjustMode && (
        <div className="mb-4 space-y-2">
          <div className="flex items-center gap-2 rounded-lg border border-amber-700/40 bg-amber-950/30 px-4 py-2.5">
            <span className="text-amber-400">✏️</span>
            <p className="flex-1 text-xs text-amber-200">
              {selectedEntry
                ? <>Selected <strong>{selectedEntry.name}</strong> — now click another entry to swap positions.</>
                : 'Click any entry to select it, then click another to swap their positions. Groups with played matches are locked.'}
            </p>
            {selectedEntry && (
              <button
                onClick={() => setSelectedEntry(null)}
                className="text-xs text-amber-500 hover:text-amber-300 transition-colors"
              >
                Clear
              </button>
            )}
          </div>
          {swapError && (
            <div className="rounded-lg border border-red-800 bg-red-950 px-3 py-2 text-xs text-red-400">
              {swapError}
            </div>
          )}
        </div>
      )}

      {/* ── Group stage draw preview panel ───────────────────────────────── */}
      {showDrawPreview && isGroupStage && gsGroupsCount && (
        <div className="mb-4 rounded-xl border border-brand-500/30 bg-brand-950/20 p-4 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">Group stage structure</p>
              <p className="mt-0.5 text-xs text-slate-500">
                Based on <span className="text-slate-300 font-medium">{entryCount} actual entries</span>
                {' '}· {gsGroupsCount} groups · {gsAdvance} advance per group
              </p>
            </div>
            <button
              onClick={() => setShowDrawPreview(false)}
              className="text-slate-500 hover:text-slate-300 transition-colors text-sm shrink-0"
            >
              ✕
            </button>
          </div>

          {/* Group cards */}
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: gsGroupsCount }, (_, i) => {
              const gName = String.fromCharCode(65 + i);
              const sz = gsGroupSizes[i] ?? Math.floor(entryCount / gsGroupsCount);
              const isExtra = gsIsUneven && i === extraGroupIndex;
              return (
                <div
                  key={gName}
                  className={`rounded-lg border px-3 py-2 min-w-[72px] ${
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
                        className={`h-1.5 rounded-full ${j < gsAdvance ? 'bg-brand-500' : 'bg-slate-700'}`}
                      />
                    ))}
                    {sz > 6 && <p className="text-[9px] text-slate-600">+{sz - 6} more</p>}
                  </div>
                  <p className="text-[9px] text-brand-400 mt-1">↑ top {gsAdvance}</p>
                </div>
              );
            })}
          </div>

          {/* Knockout flow */}
          {gsKnockoutTeams >= 2 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="rounded bg-slate-800 border border-slate-700 px-2 py-0.5 text-[11px] text-slate-400">
                Group stage
              </span>
              <span className="text-slate-600 text-xs">→</span>
              {localKnockoutSeeding === 'manual' ? (
                <span className="rounded bg-brand-900/60 px-2 py-0.5 text-[11px] font-medium text-brand-300 border border-brand-800/40">
                  Knockout Builder ({gsKnockoutTeams} qualifiers, manual pairing)
                </span>
              ) : (
                <>
                  {gsKnockoutRounds.map((round, i) => (
                    <span key={round} className="flex items-center gap-1.5">
                      <span className="rounded bg-brand-900/60 px-2 py-0.5 text-[11px] font-medium text-brand-300 border border-brand-800/40">
                        {round}
                      </span>
                      {i < gsKnockoutRounds.length - 1 && (
                        <span className="text-slate-600 text-xs">→</span>
                      )}
                    </span>
                  ))}
                  {groupStageConfig?.hasThirdPlaceMatch && (
                    <span className="text-[11px] text-slate-500 ml-1">+ 3rd place</span>
                  )}
                </>
              )}
            </div>
          )}

          {/* Knockout seeding toggle */}
          {gsKnockoutTeams >= 2 && (
            <label className="flex items-center justify-between gap-3 cursor-pointer rounded-lg border border-amber-800/40 bg-amber-950/20 p-3">
              <div>
                <span className="text-xs font-medium text-slate-300">
                  {localKnockoutSeeding === 'manual' ? 'Manual seeding' : 'Automatic seeding'}
                </span>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {localKnockoutSeeding === 'manual'
                    ? "After the group stage, you'll manually pair qualifiers for crossover/playoff matches via the Knockout Builder — no auto-byes."
                    : 'The bracket is generated automatically; top seeds receive byes into the next round.'}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={localKnockoutSeeding === 'manual'}
                disabled={savingKnockoutSeeding}
                onClick={handleKnockoutSeedingToggle}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
                  localKnockoutSeeding === 'manual' ? 'bg-brand-600' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    localKnockoutSeeding === 'manual' ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </label>
          )}

          {/* Extra player picker — only when uneven */}
          {gsIsUneven && (
            <div>
              <p className="text-xs font-medium text-slate-400 mb-1.5">
                Extra player assignment
                <span className="ml-1.5 text-[10px] text-slate-500">
                  ({entryCount} entries ÷ {gsGroupsCount} groups — pick which group gets the extra player)
                </span>
              </p>
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: gsGroupsCount }, (_, i) => {
                  const gName = String.fromCharCode(65 + i);
                  const sz = gsGroupSizes[i] ?? Math.floor(entryCount / gsGroupsCount);
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setExtraGroupIndex(i)}
                      className={`rounded-lg border px-2.5 py-1 text-xs transition-colors ${
                        i === extraGroupIndex
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

          {/* Legend */}
          <p className="text-[10px] text-slate-500">
            <span className="inline-block h-1.5 w-4 rounded-full bg-brand-500 mr-1 align-middle" />
            advances to knockout
            <span className="inline-block h-1.5 w-4 rounded-full bg-slate-700 mx-1 ml-3 align-middle" />
            eliminated
          </p>

          {/* Action buttons */}
          <div className="flex items-center gap-3 pt-1 border-t border-surface-border">
            <button
              onClick={() => handleGenerateConfirmed(gsIsUneven ? gsGroupSizes : undefined)}
              disabled={loading}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'Generating…' : 'Confirm & generate draw'}
            </button>
            <button
              onClick={() => setShowDrawPreview(false)}
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Draw is being generated / cleared / rebuilt — shown until the new
          server data actually lands, so the section never goes blank or
          jumps once the bracket pops in (see the initialMatches effect above). */}
      {loading && (
        <div className="rounded-xl bg-surface-card p-8 text-center ring-1 ring-surface-border">
          <div className="mx-auto mb-3 h-6 w-6 animate-spin rounded-full border-2 border-slate-700 border-t-brand-500" />
          <p className="text-sm font-medium text-white">
            {isDrawn ? 'Updating draw…' : 'Generating draw…'}
          </p>
          <p className="mt-1 text-xs text-slate-500">This only takes a moment.</p>
        </div>
      )}

      {/* Draw not yet generated */}
      {!isDrawn && !loading && !showDrawPreview && (
        <div className="rounded-xl bg-surface-card p-8 text-center ring-1 ring-surface-border">
          <p className="text-2xl mb-2">🎯</p>
          <p className="text-sm font-medium text-white mb-1">Draw not generated yet</p>
          <p className="text-xs text-slate-500">
            {entryCount < 2
              ? 'Add at least 2 entries before generating a draw.'
              : `${entryCount} entr${entryCount === 1 ? 'y' : 'ies'} ready · click Generate draw to create the bracket`}
          </p>
        </div>
      )}

      {/* Bracket / schedule — team_event renders its own tie-based bracket/standings instead */}
      {playFormat !== 'team_event' && showBracket && isDrawn && matches.length > 0 && !loading && (
        <BracketView
          matches={matches}
          format={drawFormat}
          tournamentSlug={tournamentSlug}
          readOnly={readOnly}
          adjustMode={adjustMode}
          selectedEntryId={selectedEntry?.id ?? null}
          onEntryClick={handleEntryClick}
        />
      )}

      {/* Live standings — round-robin, swiss, group stage */}
      {playFormat !== 'team_event' && showStandings && isDrawn && matches.length > 0 && !loading && (
        <StandingsTable matches={matches} format={drawFormat} advancePerGroup={gsAdvance} />
      )}

      {/* ── Fixed bottom confirmation bar ────────────────────────────────────
          Rendered outside normal flow so it stays visible while scrolling.
          Adds pb-24 to the section (above) so no content is hidden behind it. */}
      {adjustMode && pendingSwap && (
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-brand-700/50 bg-surface/95 backdrop-blur-sm shadow-2xl">
          <div className="mx-auto max-w-4xl flex items-center gap-4 flex-wrap px-6 py-4">
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-0.5">Confirm swap</p>
              <p className="text-sm text-slate-200 truncate">
                <span className="font-semibold text-white">{pendingSwap.name1}</span>
                <span className="mx-2 text-slate-500">↔</span>
                <span className="font-semibold text-white">{pendingSwap.name2}</span>
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setPendingSwap(null)}
                className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:border-slate-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmSwap}
                disabled={swapping}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
              >
                {swapping ? 'Swapping…' : 'Confirm swap'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
