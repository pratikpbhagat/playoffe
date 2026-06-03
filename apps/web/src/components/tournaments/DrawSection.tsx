'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { generateDrawAction, clearDrawAction, generateNextSwissRoundAction, promoteGroupWinnersAction, swapDrawEntriesAction, replaceDrawEntryAction } from '@/lib/actions/draws';
import { shareDrawOnSocialAction } from '@/lib/actions/social';
import { useToast } from '@/components/ui/ToastProvider';
import type { MatchWithPlayers } from '@/lib/actions/draws';
import { BracketView } from './BracketView';
import { useRealtimeCategoryMatches } from '@/hooks/useRealtimeCategoryMatches';
import { StandingsTable } from './StandingsTable';

interface StalenessEntry {
  id: string;
  name: string;
}

interface Props {
  categoryId: string;
  tournamentSlug: string;
  drawFormat: string;
  categoryStatus: string;
  entryCount: number;
  initialMatches: MatchWithPlayers[];
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
}

const FORMAT_LABEL: Record<string, string> = {
  round_robin: 'Round robin',
  single_elimination: 'Single elimination',
  double_elimination: 'Double elimination',
  group_stage_knockout: 'Group stage + knockout',
  swiss: 'Swiss',
};

export function DrawSection({
  categoryId,
  tournamentSlug,
  drawFormat,
  categoryStatus,
  entryCount,
  initialMatches,
  showBracket = true,
  showStandings = true,
  readOnly = false,
  shareOnSocialEnabled = false,
  stalenessInfo,
}: Props) {
  const router    = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [generatingSwissRound, setGeneratingSwissRound] = useState(false);
  const [promotingGroups, setPromotingGroups] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRegenConfirm, setShowRegenConfirm] = useState(false);
  const [matches, setMatches] = useState(initialMatches);

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

  // Sync matches when server re-renders after router.refresh() passes new initialMatches
  useEffect(() => {
    setMatches(initialMatches);
  }, [initialMatches]);

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
  const knockoutSlotsEmpty = knockoutMatches.some((m) => !m.entry_a && !m.entry_b);
  const canPromoteGroups = isGroupKnockout && isDrawn && allGroupMatchesDone && knockoutSlotsEmpty;

  async function handlePromoteGroups() {
    setPromotingGroups(true);
    setError(null);
    const result = await promoteGroupWinnersAction(categoryId);
    if ('error' in result && result.error) {
      setError(result.error);
    } else {
      router.refresh();
    }
    setPromotingGroups(false);
  }

  // Can adjust: draw exists, category not completed, not swiss
  const canAdjust =
    isDrawn &&
    categoryStatus !== 'completed' &&
    drawFormat !== 'swiss' &&
    matches.length > 0 &&
    !readOnly;

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

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    const result = await generateDrawAction(categoryId);
    if (result.error) {
      setError(result.error);
    } else {
      router.refresh();
    }
    setLoading(false);
  }

  async function handleClear() {
    setShowRegenConfirm(false);
    setLoading(true);
    setError(null);
    await clearDrawAction(categoryId);
    setMatches([]);
    router.refresh();
    setLoading(false);
  }

  async function handleGenerateNextSwissRound() {
    setGeneratingSwissRound(true);
    setError(null);
    const result = await generateNextSwissRoundAction(categoryId);
    if ('error' in result && result.error) {
      setError(result.error);
    } else {
      router.refresh();
    }
    setGeneratingSwissRound(false);
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
                  {/* Link to schedule page */}
                  {!showRegenConfirm && (
                    <Link
                      href={`/tournaments/${tournamentSlug}/schedule`}
                      className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-300 hover:border-brand-500 hover:text-brand-400 transition-colors"
                    >
                      📅 Schedule
                    </Link>
                  )}

                  {/* Adjust draw button */}
                  {canAdjust && !showRegenConfirm && (
                    <button
                      onClick={() => setAdjustMode(true)}
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

                  {categoryStatus === 'draw_generated' && !showRegenConfirm && (
                    <button
                      onClick={() => setShowRegenConfirm(true)}
                      className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-300 hover:border-red-600 hover:text-red-400 transition-colors"
                    >
                      Regenerate
                    </button>
                  )}

                  {showRegenConfirm && (
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
            </div>
          )}

          {/* Only withdrawn entries — no new entry available to slot in */}
          {stalenessInfo.withdrawnInDraw.length > 0 && stalenessInfo.unplacedActive.length === 0 && (
            <p className="text-xs text-amber-400/70">
              Withdrawn {stalenessInfo.withdrawnInDraw.length === 1 ? 'entry remains' : 'entries remain'} in the bracket.{' '}
              <button
                onClick={() => setShowRegenConfirm(true)}
                className="underline hover:text-amber-300 transition-colors"
              >
                Regenerate the draw
              </button>{' '}
              to remove {stalenessInfo.withdrawnInDraw.length === 1 ? 'it' : 'them'}.
            </p>
          )}

          {/* Only new entries — nothing withdrawn to replace */}
          {stalenessInfo.withdrawnInDraw.length === 0 && stalenessInfo.unplacedActive.length > 0 && (
            <p className="text-xs text-amber-400/70">
              {stalenessInfo.unplacedActive.length} new entr{stalenessInfo.unplacedActive.length === 1 ? 'y is' : 'ies are'} not in the draw.{' '}
              <button
                onClick={() => setShowRegenConfirm(true)}
                className="underline hover:text-amber-300 transition-colors"
              >
                Regenerate the draw
              </button>{' '}
              to include {stalenessInfo.unplacedActive.length === 1 ? 'it' : 'them'}.
            </p>
          )}
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

      {/* Draw not yet generated */}
      {!isDrawn && !loading && (
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

      {/* Bracket / schedule */}
      {showBracket && isDrawn && matches.length > 0 && (
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
      {showStandings && isDrawn && matches.length > 0 && (
        <StandingsTable matches={matches} format={drawFormat} />
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
