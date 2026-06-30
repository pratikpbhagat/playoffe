'use client';

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  batchScheduleMatchesAction,
  generateSmartScheduleAction,
  updateCourtCountAction,
  resetCategoryScheduleAction,
} from '@/lib/actions/scheduling';
import type { ScheduleUpdate, ConflictInfo } from '@/lib/actions/scheduling';
import { detectConflictsFromUpdates } from '@/lib/scheduling-utils';
import { ScheduleSettingsModal } from './ScheduleSettingsModal';
import type { ScheduleSettings } from './ScheduleSettingsModal';
import { RubberOrderEditor } from './RubberOrderEditor';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';

// Loaded on demand — only rendered when the user opens the AI panel,
// so there's no reason to include it in the schedule page's initial bundle.
const ScheduleAIPanel = dynamic(
  () => import('./ScheduleAIPanel').then((m) => ({ default: m.ScheduleAIPanel })),
  { ssr: false },
);

export interface MatchForScheduling {
  id: string;
  status: string;
  court: number | null;
  scheduled_time: string | null;
  round: number;
  round_name: string | null;
  group_name: string | null;
  category_id: string;
  category_name: string;
  player_a: string;
  player_b: string;
  /** True when the corresponding slot isn't a real entry yet — a knockout
   *  placeholder like "1st Group A" or "Winner of Quarter-Final Match 1". */
  player_a_is_placeholder?: boolean;
  player_b_is_placeholder?: boolean;
  /** Team-event rubber matches — used to keep a tie's rubbers in their
   *  configured playing order regardless of scheduled time. */
  tie_id?: string | null;
  rubber_sequence?: number | null;
  is_decider?: boolean;
  /** Only set once a lineup is in (player_a/player_b are then individual
   *  player names) — shown as a differently-colored prefix so the row is
   *  still identifiable as belonging to that team. */
  team_a_name?: string | null;
  team_b_name?: string | null;
  /** The rubber's own name ("Singles 1", "Decider") — null for non-team-event
   *  matches. Kept separate from round_name, which is the section header and
   *  must stay the plain stage name (not one row's specific rubber). */
  rubber_label?: string | null;
}

interface Props {
  tournamentSlug: string;
  startDate: string;
  courtCount: number;
  /** Tournament-wide fallback — used only for a category with no resolvable scoring config. */
  matchDurationMins: number;
  changeoverMins: number;
  defaultStartTime: string;  // "09:00"
  matches: MatchForScheduling[];
  /** Per-category effective match duration (categories can override the
   *  tournament's scoring format/set count), keyed by category_id. */
  categoryDurationMins?: Record<string, number>;
  aiEnabled?: boolean;
  aiConfigured?: boolean;    // true = real API key present; false = show setup message
  /** Team-event categories only — keyed by category_id. Lets the admin
   *  reorder rubber play order from this page before running "Schedule all
   *  matches" (available, not required). */
  rubberLineupByCategory?: Record<string, { sequence: number; name: string; play_format: string }[]>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function pad(n: number) { return String(n).padStart(2, '0'); }

function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(local: string): string | null {
  if (!local) return null;
  return new Date(local).toISOString();
}

function toTimeString(base: Date, minuteOffset: number): string {
  const d = new Date(base.getTime() + minuteOffset * 60_000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ScheduleEditor({
  tournamentSlug,
  startDate,
  courtCount: initialCourtCount,
  matchDurationMins,
  changeoverMins,
  defaultStartTime,
  matches,
  categoryDurationMins = {},
  aiEnabled = false,
  aiConfigured = false,
  rubberLineupByCategory = {},
}: Props) {
  const router = useRouter();
  const { confirm } = useConfirm();
  const [resettingSchedule, setResettingSchedule] = useState(false);
  const [rubberOrderOpen, setRubberOrderOpen] = useState(false);

  // ── Manual drag-and-drop ordering ──────────────────────────────────────────
  // A "block" is one draggable unit: a team-event tie's whole rubber set
  // (every row sharing a tie_id) moves together, or a single row for
  // everything else. Keyed per-section (`${catId}::${groupKey}`) so dragging
  // in one category/group never affects another. Only the *display order* —
  // and therefore the order "Auto-fill group" assigns times in — changes;
  // dragging never touches a match's actual scheduled_time/court itself.
  const [manualOrder, setManualOrder] = useState<Record<string, string[]>>({});
  const [dragState, setDragState] = useState<{ sectionKey: string; blockKey: string } | null>(null);

  function blockKeyOf(m: MatchForScheduling): string { return m.tie_id ?? `single:${m.id}`; }

  function groupIntoBlocks(rows: MatchForScheduling[]): { key: string; rows: MatchForScheduling[] }[] {
    const map = new Map<string, MatchForScheduling[]>();
    const order: string[] = [];
    for (const m of rows) {
      const key = blockKeyOf(m);
      if (!map.has(key)) { map.set(key, []); order.push(key); }
      map.get(key)!.push(m);
    }
    return order.map((key) => ({ key, rows: map.get(key)! }));
  }

  function applyManualOrder(sectionKey: string, rows: MatchForScheduling[]): MatchForScheduling[] {
    const order = manualOrder[sectionKey];
    if (!order) return rows;
    const blocks = groupIntoBlocks(rows);
    const blockByKey = new Map(blocks.map((b) => [b.key, b.rows]));
    const orderedKeys = [...order.filter((k) => blockByKey.has(k)), ...blocks.map((b) => b.key).filter((k) => !order.includes(k))];
    return orderedKeys.flatMap((k) => blockByKey.get(k)!);
  }

  function handleBlockDrop(sectionKey: string, targetBlockKey: string, currentRows: MatchForScheduling[]) {
    if (!dragState || dragState.sectionKey !== sectionKey || dragState.blockKey === targetBlockKey) { setDragState(null); return; }
    const blocks = groupIntoBlocks(currentRows);
    const keys = blocks.map((b) => b.key);
    const fromIdx = keys.indexOf(dragState.blockKey);
    const toIdx = keys.indexOf(targetBlockKey);
    if (fromIdx === -1 || toIdx === -1) { setDragState(null); return; }
    const next = [...keys];
    next.splice(fromIdx, 1);
    next.splice(toIdx, 0, dragState.blockKey);
    setManualOrder((prev) => ({ ...prev, [sectionKey]: next }));
    setDragState(null);
  }

  // Resolve each match's own duration (per-category override → tournament fallback)
  const durationByMatchId = useMemo(
    () => new Map(matches.map((m) => [m.id, categoryDurationMins[m.category_id] ?? matchDurationMins])),
    [matches, categoryDurationMins, matchDurationMins],
  );
  // ── Core edit state ────────────────────────────────────────────────────────
  const [edits, setEdits] = useState<Record<string, { time: string; court: string }>>(() => {
    const init: Record<string, { time: string; court: string }> = {};
    for (const m of matches) {
      init[m.id] = {
        time:  toLocalInput(m.scheduled_time),
        court: m.court != null ? String(m.court) : '',
      };
    }
    return init;
  });

  // ── Dynamic court count ───────────────────────────────────────────────────
  const [courtCount, setCourtCount]               = useState(initialCourtCount);
  const [courtUpdateLoading, setCourtUpdateLoading] = useState(false);
  const [invalidatedByCourtChange, setInvalidatedByCourtChange] = useState<Set<string>>(new Set());

  async function handleCourtCountChange(newCount: number) {
    if (newCount < 1 || newCount === courtCount) return;
    setCourtUpdateLoading(true);
    const result = await updateCourtCountAction(tournamentSlug, newCount);
    setCourtUpdateLoading(false);
    if ('error' in result) return;
    setCourtCount(newCount);
    setInvalidatedByCourtChange(new Set(result.invalidatedMatchIds));
  }

  const availableCourts = Array.from({ length: courtCount }, (_, i) => i + 1);

  // ── Conflict detection (derived) ──────────────────────────────────────────
  const conflicts = useMemo<ConflictInfo[]>(() => {
    const updates: ScheduleUpdate[] = matches
      .filter((m) => m.status === 'scheduled')
      .map((m) => ({
        matchId:       m.id,
        scheduledTime: fromLocalInput(edits[m.id]?.time ?? '') ?? null,
        court:         edits[m.id]?.court ? parseInt(edits[m.id].court) : null,
      }));
    return detectConflictsFromUpdates(updates, durationByMatchId, availableCourts);
  }, [edits, matches, durationByMatchId, availableCourts]);

  const conflictById = useMemo(
    () => new Map(conflicts.map((c) => [c.matchId, c.message])),
    [conflicts],
  );

  // ── Save state ─────────────────────────────────────────────────────────────
  const [saving, setSaving]   = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok?: string; err?: string } | null>(null);

  // ── UI state ──────────────────────────────────────────────────────────────
  const [showModal, setShowModal]         = useState(false);
  const [generating, setGenerating]       = useState(false);
  const [showAI, setShowAI]               = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // ── Category list ─────────────────────────────────────────────────────────
  const categories = useMemo(() => {
    const seen = new Map<string, { id: string; name: string }>();
    for (const m of matches) {
      if (!seen.has(m.category_id)) seen.set(m.category_id, { id: m.category_id, name: m.category_name });
    }
    return Array.from(seen.values());
  }, [matches]);

  const [activeCatId, setActiveCatId] = useState(categories[0]?.id ?? '');

  // ── Per-group legacy auto-fill state ─────────────────────────────────────
  const [groupFill, setGroupFill] = useState<Record<string, { datetime: string; interval: number; court: string }>>({});

  function gfKey(catId: string, groupKey: string) { return `${catId}::${groupKey}`; }
  function getGf(catId: string, groupKey: string) {
    return groupFill[gfKey(catId, groupKey)] ?? {
      datetime: `${startDate}T${defaultStartTime.slice(0, 5)}`,
      interval: matchDurationMins + changeoverMins,
      court: '',
    };
  }
  function setGf(catId: string, groupKey: string, patch: Partial<{ datetime: string; interval: number; court: string }>) {
    setGroupFill((prev) => ({ ...prev, [gfKey(catId, groupKey)]: { ...getGf(catId, groupKey), ...patch } }));
  }

  function updateEdit(id: string, patch: Partial<{ time: string; court: string }>) {
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
    setSaveMsg(null);
  }

  function handleGroupAutoFill(catId: string, groupKey: string, groupMatches: MatchForScheduling[]) {
    const gf = getGf(catId, groupKey);
    // groupMatches (= the section's already-rendered row list) is already in
    // the right order — manually dragged order if set, otherwise chronological
    // — so fill times in that order rather than re-sorting by round, which
    // would silently undo a manual drag for group-stage sections (whose ties
    // span different round numbers).
    const fillable = groupMatches.filter((m) => m.status === 'scheduled');
    if (!fillable.length) return;
    const base = new Date(gf.datetime);
    if (isNaN(base.getTime())) return;
    setEdits((prev) => {
      const next = { ...prev };
      fillable.forEach((m, i) => {
        next[m.id] = { time: toTimeString(base, i * gf.interval), court: gf.court || prev[m.id]?.court || '' };
      });
      return next;
    });
    setSaveMsg(null);
  }

  // ── Smart generate ─────────────────────────────────────────────────────────
  async function handleGenerate(settings: ScheduleSettings) {
    setGenerating(true);
    const result = await generateSmartScheduleAction(tournamentSlug, settings);
    setGenerating(false);
    setShowModal(false);

    if ('error' in result) {
      setSaveMsg({ err: result.error });
      return;
    }

    // Apply generated schedule to edits (preview — not yet saved)
    setEdits((prev) => {
      const next = { ...prev };
      for (const u of result.updates) {
        if (!next[u.matchId]) continue;
        next[u.matchId] = {
          time:  u.scheduledTime ? toLocalInput(u.scheduledTime) : '',
          court: u.court != null ? String(u.court) : '',
        };
      }
      return next;
    });

    if (result.conflicts.length > 0) {
      setSaveMsg({ err: `Schedule generated with ${result.conflicts.length} conflict(s) — check highlighted rows.` });
    } else {
      setSaveMsg({ ok: `Schedule generated for ${result.updates.length} matches — review and save.` });
    }
  }

  // ── Reset one category's schedule ─────────────────────────────────────────
  async function handleResetCategorySchedule() {
    const category = categories.find((c) => c.id === activeCatId);
    if (!category) return;
    const ok = await confirm({
      title: 'Reset schedule',
      message: `Clear the court/time for every scheduled match in "${category.name}"? This can't be undone — you'll need to re-run "Schedule all matches" or reassign manually.`,
      confirmLabel: 'Reset schedule',
      variant: 'danger',
    });
    if (!ok) return;

    setResettingSchedule(true);
    const result = await resetCategoryScheduleAction(tournamentSlug, activeCatId);
    setResettingSchedule(false);

    if ('error' in result) {
      setSaveMsg({ err: result.error });
      return;
    }
    setEdits((prev) => {
      const next = { ...prev };
      for (const m of matches) {
        if (m.category_id === activeCatId) next[m.id] = { time: '', court: '' };
      }
      return next;
    });
    setSaveMsg({ ok: `Schedule reset for ${result.count} match${result.count !== 1 ? 'es' : ''} in "${category.name}".` });
    router.refresh();
  }

  // ── Apply AI updates ──────────────────────────────────────────────────────
  const handleApplyAI = useCallback((updates: ScheduleUpdate[]) => {
    setEdits((prev) => {
      const next = { ...prev };
      for (const u of updates) {
        if (!next[u.matchId]) continue;
        next[u.matchId] = {
          time:  u.scheduledTime ? toLocalInput(u.scheduledTime) : '',
          court: u.court != null ? String(u.court) : '',
        };
      }
      return next;
    });
    setSaveMsg({ ok: `AI applied ${updates.length} change(s) — review and save.` });
  }, []);

  // ── Save ──────────────────────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true);
    setSaveMsg(null);
    const updates = matches
      .filter((m) => m.status === 'scheduled')
      .map((m) => ({
        matchId:       m.id,
        scheduledTime: fromLocalInput(edits[m.id]?.time ?? ''),
        court:         edits[m.id]?.court ? parseInt(edits[m.id].court) : null,
      }));
    const result = await batchScheduleMatchesAction(tournamentSlug, updates);
    setSaving(false);
    if (result.error) {
      setSaveMsg({ err: result.error });
    } else {
      setSaveMsg({ ok: `Saved ${result.count} match${result.count !== 1 ? 'es' : ''}.` });
    }
  }

  // ── Dirty count ───────────────────────────────────────────────────────────
  const totalDirty = useMemo(() => {
    let count = 0;
    for (const m of matches) {
      if (m.status !== 'scheduled') continue;
      const origTime  = toLocalInput(m.scheduled_time);
      const origCourt = m.court != null ? String(m.court) : '';
      const e = edits[m.id];
      if (e && (e.time !== origTime || e.court !== origCourt)) count++;
    }
    return count;
  }, [matches, edits]);

  // ── Active category groups ─────────────────────────────────────────────────
  // Group-stage matches are grouped by group name (alphabetical); knockout
  // matches are split into one section per round (Quarter-Final, Semi-Final,
  // Final, …) so the stage name is shown as a header before its placeholder
  // matches, instead of lumping every knockout round into one flat list.
  const activeGroups = useMemo(() => {
    const catMatches = matches.filter((m) => m.category_id === activeCatId);

    // Sort by the *live* edited time (not the original server value) so a
    // freshly generated/edited schedule re-orders immediately, before saving.
    // A tie's rubbers always play in the same order, on the same court,
    // back-to-back — they must render as one adjacent block, not just be
    // individually orderable relative to each other. A flat comparator-only
    // sort can't guarantee that (sort isn't transitive once the comparison
    // rule changes depending on which two rows you're comparing), so this
    // explicitly groups same-tie_id rows into blocks first, sorts each
    // block's rubbers internally (sequence ascending, decider last), then
    // sorts the blocks themselves chronologically before flattening back out.
    function byScheduledTime(list: MatchForScheduling[]): MatchForScheduling[] {
      const blocksByKey = new Map<string, MatchForScheduling[]>();
      const keyOrder: string[] = [];
      for (const m of list) {
        const key = m.tie_id ?? `single:${m.id}`;
        if (!blocksByKey.has(key)) { blocksByKey.set(key, []); keyOrder.push(key); }
        blocksByKey.get(key)!.push(m);
      }
      const blocks = keyOrder.map((key) => blocksByKey.get(key)!);

      for (const block of blocks) {
        block.sort((a, b) => {
          const seqA = a.is_decider ? Infinity : a.rubber_sequence ?? 0;
          const seqB = b.is_decider ? Infinity : b.rubber_sequence ?? 0;
          return seqA - seqB;
        });
      }

      function earliestTime(block: MatchForScheduling[]): string {
        const times = block.map((m) => edits[m.id]?.time || '').filter(Boolean).sort();
        return times[0] ?? '';
      }

      blocks.sort((ba, bb) => {
        const ta = earliestTime(ba);
        const tb = earliestTime(bb);
        if (ta && tb) return ta < tb ? -1 : ta > tb ? 1 : 0;
        if (ta) return -1;
        if (tb) return 1;
        return ba[0].round - bb[0].round;
      });

      return blocks.flat();
    }

    const groupStageMap = new Map<string, MatchForScheduling[]>();
    const knockoutMap = new Map<number, MatchForScheduling[]>();
    for (const m of catMatches) {
      if (m.group_name !== null) {
        if (!groupStageMap.has(m.group_name)) groupStageMap.set(m.group_name, []);
        groupStageMap.get(m.group_name)!.push(m);
      } else {
        if (!knockoutMap.has(m.round)) knockoutMap.set(m.round, []);
        knockoutMap.get(m.round)!.push(m);
      }
    }

    const groupSections = Array.from(groupStageMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, grpMatches]) => ({
        key,
        label: key,
        matches: applyManualOrder(`${activeCatId}::${key}`, byScheduledTime(grpMatches)),
      }));

    const knockoutSections = Array.from(knockoutMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([round, grpMatches]) => {
        const key = `__ko__::${round}`;
        return {
          key,
          label: grpMatches[0]?.round_name ?? `Knockout Round ${round}`,
          matches: applyManualOrder(`${activeCatId}::${key}`, byScheduledTime(grpMatches)),
        };
      });

    return [...groupSections, ...knockoutSections];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches, activeCatId, edits, manualOrder]);

  // ── Current schedule for AI ───────────────────────────────────────────────
  const currentScheduleForAI = useMemo<ScheduleUpdate[]>(() =>
    matches
      .filter((m) => m.status === 'scheduled')
      .map((m) => ({
        matchId:       m.id,
        scheduledTime: fromLocalInput(edits[m.id]?.time ?? '') ?? null,
        court:         edits[m.id]?.court ? parseInt(edits[m.id].court) : null,
      })),
    [matches, edits],
  );

  // ── Early exit ────────────────────────────────────────────────────────────
  if (matches.length === 0) {
    return (
      <div className="rounded-xl bg-surface-card p-10 text-center ring-1 ring-surface-border">
        <p className="text-2xl mb-2">📅</p>
        <p className="text-sm font-medium text-white mb-1">No matches to schedule yet</p>
        <p className="text-xs text-slate-500">Generate a draw for at least one category first.</p>
      </div>
    );
  }

  const inputCls =
    'block w-full rounded border border-slate-700 bg-surface px-2 py-1.5 text-xs text-white outline-none focus:border-brand-500 disabled:opacity-40';

  return (
    <div className="relative">
      {/* ── Main schedule editor — always full width ─────────────────────── */}
      <div className="space-y-4 pb-28">

        {/* ── Top action bar ──────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Primary CTA */}
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
          >
            ⚡ Schedule all matches
          </button>

          {/* AI toggle */}
          {aiEnabled && (
            <button
              onClick={() => setShowAI((s) => !s)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors ${
                showAI
                  ? 'border-brand-600 bg-brand-600/20 text-brand-300'
                  : 'border-slate-600 text-slate-300 hover:border-brand-600 hover:text-brand-300'
              }`}
            >
              🤖 AI Assistant
            </button>
          )}

          {/* Dynamic court count */}
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-slate-400">Courts:</span>
            <input
              type="number"
              min={1}
              max={50}
              value={courtCount}
              disabled={courtUpdateLoading}
              onChange={(e) => {
                const v = parseInt(e.target.value) || 1;
                void handleCourtCountChange(v);
              }}
              className="w-16 rounded border border-slate-700 bg-surface px-2 py-1 text-xs text-white outline-none focus:border-brand-500 disabled:opacity-50"
            />
            {invalidatedByCourtChange.size > 0 && (
              <span className="text-xs text-amber-400">
                ⚠️ {invalidatedByCourtChange.size} on removed courts
              </span>
            )}
          </div>
        </div>

        {/* ── Conflict banner ──────────────────────────────────────────────── */}
        {conflicts.length > 0 && (
          <div className="rounded-lg border border-red-800/50 bg-red-950/30 px-4 py-3 flex items-center gap-3">
            <span className="text-red-400 text-lg">⚠️</span>
            <p className="text-sm text-red-300">
              <span className="font-semibold">{conflicts.length} scheduling conflict{conflicts.length !== 1 ? 's' : ''}</span>
              {' '}— fix highlighted matches before saving.
            </p>
          </div>
        )}

        {/* ── Status / save message ────────────────────────────────────────── */}
        {saveMsg && (
          <div className={`rounded-lg px-4 py-2.5 text-sm ${
            saveMsg.err
              ? 'bg-red-950/30 border border-red-800/50 text-red-300'
              : 'bg-accent-950/30 border border-accent-800/50 text-accent-300'
          }`}>
            {saveMsg.err ?? saveMsg.ok}
          </div>
        )}

        {/* ── Category selector ────────────────────────────────────────────── */}
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
          <label className="text-xs font-medium text-slate-400 shrink-0 flex items-center gap-1.5">
            Category
            {categories.length > 1 && (
              <span className="rounded-full bg-surface-card px-1.5 py-0.5 text-[10px] font-semibold text-slate-300 ring-1 ring-surface-border">
                {categories.length}
              </span>
            )}
          </label>
          <div className="relative w-full sm:flex-1 sm:max-w-sm">
            <select
              value={activeCatId}
              onChange={(e) => { setActiveCatId(e.target.value); setSaveMsg(null); }}
              className="w-full appearance-none rounded-lg border border-slate-600 bg-surface-card px-4 py-2 pr-9 text-sm text-white outline-none focus:border-brand-500 cursor-pointer"
            >
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">▾</span>
          </div>
          {activeCatId && (
            <button
              onClick={handleResetCategorySchedule}
              disabled={resettingSchedule}
              className="shrink-0 rounded-lg border border-slate-600 px-3 py-2 text-xs font-medium text-slate-400 hover:border-red-600 hover:text-red-400 transition-colors disabled:opacity-50"
            >
              {resettingSchedule ? 'Resetting…' : '↺ Reset schedule for this category'}
            </button>
          )}
        </div>

        {/* ── Team-event rubber order — set this before "Schedule all matches" so
            ties get scheduled in the right play order. Optional, not enforced. */}
        {activeCatId && (rubberLineupByCategory[activeCatId]?.length ?? 0) > 1 && (
          <div className="rounded-lg border border-surface-border bg-surface overflow-hidden">
            <button
              onClick={() => setRubberOrderOpen((o) => !o)}
              className="w-full px-4 py-3 text-left flex items-center justify-between gap-3 hover:bg-surface-border/40 transition-colors"
            >
              <span className="text-xs font-semibold text-slate-300">
                Rubber order <span className="font-normal text-slate-500">(set this before scheduling, if needed)</span>
              </span>
              <span className={`shrink-0 text-slate-500 transition-transform ${rubberOrderOpen ? 'rotate-180' : ''}`}>▾</span>
            </button>
            {rubberOrderOpen && (
              <div className="border-t border-surface-border">
                <RubberOrderEditor categoryId={activeCatId} rubberLineup={rubberLineupByCategory[activeCatId]} />
              </div>
            )}
          </div>
        )}

        {/* ── Groups ──────────────────────────────────────────────────────── */}
        {activeGroups.map((group) => {
          const gf              = getGf(activeCatId, group.key);
          const isExpanded      = expandedGroups.has(`${activeCatId}::${group.key}`);
          const groupConflicts  = group.matches.filter((m) => conflictById.has(m.id)).length;
          const groupInvalidated = group.matches.filter((m) => invalidatedByCourtChange.has(m.id)).length;

          return (
            <div key={group.key} className="rounded-xl bg-surface-card ring-1 ring-surface-border overflow-hidden">
              {/* Group header */}
              <div className="border-b border-surface-border bg-surface px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
                      {group.label}
                    </p>
                    {groupConflicts > 0 && (
                      <span className="rounded-full bg-red-900/40 px-2 py-0.5 text-[10px] font-bold text-red-400">
                        ⚠️ {groupConflicts} conflict{groupConflicts !== 1 ? 's' : ''}
                      </span>
                    )}
                    {groupInvalidated > 0 && (
                      <span className="rounded-full bg-amber-900/40 px-2 py-0.5 text-[10px] font-bold text-amber-400">
                        ⚠️ {groupInvalidated} on removed court{groupInvalidated !== 1 ? 's' : ''}
                      </span>
                    )}
                    <span className="hidden sm:flex items-center gap-1 text-[10px] text-slate-600">
                      <span aria-hidden>⠿</span> Drag to reorder
                    </span>
                  </div>

                  {/* Advanced toggle */}
                  <button
                    onClick={() => setExpandedGroups((prev) => {
                      const key = `${activeCatId}::${group.key}`;
                      const next = new Set(prev);
                      next.has(key) ? next.delete(key) : next.add(key);
                      return next;
                    })}
                    className="text-[11px] text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    {isExpanded ? '▴ Hide advanced' : '▾ Advanced'}
                  </button>
                </div>

                {/* Advanced auto-fill controls (collapsed by default) */}
                {isExpanded && (
                  <div className="mt-3 flex flex-wrap items-end gap-3 pt-3 border-t border-surface-border">
                    <label className="space-y-1">
                      <span className="text-[10px] text-slate-500">Start time</span>
                      <input
                        type="datetime-local"
                        value={gf.datetime}
                        onChange={(e) => setGf(activeCatId, group.key, { datetime: e.target.value })}
                        className={inputCls + ' w-44'}
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[10px] text-slate-500">Min / match</span>
                      <input
                        type="number" min={5} max={180} value={gf.interval}
                        onChange={(e) => setGf(activeCatId, group.key, { interval: parseInt(e.target.value) || 30 })}
                        className={inputCls + ' w-20'}
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[10px] text-slate-500">Default court</span>
                      <input
                        type="number" min={1} max={courtCount} placeholder="—" value={gf.court}
                        onChange={(e) => setGf(activeCatId, group.key, { court: e.target.value })}
                        className={inputCls + ' w-20'}
                      />
                    </label>
                    <button
                      onClick={() => handleGroupAutoFill(activeCatId, group.key, group.matches)}
                      className="self-end rounded border border-brand-600/50 bg-brand-600/20 px-3 py-1.5 text-xs font-semibold text-brand-300 hover:bg-brand-600/30 transition-colors"
                    >
                      ⚡ Auto-fill group
                    </button>
                  </div>
                )}
              </div>

              {/* Match table */}
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-border bg-surface/40">
                    <th className="px-2 py-2 text-left text-[10px] font-medium text-slate-500 w-12">
                      <span className="flex items-center gap-1" title="Drag the ⠿ handle to reorder matches">
                        <span aria-hidden>⠿</span> Order
                      </span>
                    </th>
                    <th className="px-4 py-2 text-left text-[10px] font-medium text-slate-500">Match</th>
                    <th className="hidden sm:table-cell px-4 py-2 text-left text-[10px] font-medium text-slate-500 w-44">Date &amp; time</th>
                    <th className="hidden sm:table-cell px-4 py-2 text-left text-[10px] font-medium text-slate-500 w-20">Court</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {(() => {
                    const sectionKey = `${activeCatId}::${group.key}`;
                    return group.matches.map((m, idx) => {
                    const e           = edits[m.id] ?? { time: '', court: '' };
                    const isWalkover  = m.status === 'walkover' || m.status === 'retired';
                    const conflict    = conflictById.get(m.id);
                    const courtInvalid = invalidatedByCourtChange.has(m.id);
                    const hasIssue    = !!conflict || courtInvalid;
                    const blockKey    = blockKeyOf(m);
                    const isFirstOfBlock = idx === 0 || blockKeyOf(group.matches[idx - 1]) !== blockKey;
                    const isDraggingThis = dragState?.sectionKey === sectionKey && dragState.blockKey === blockKey;

                    return (
                      <tr
                        key={m.id}
                        onDragOver={(ev) => ev.preventDefault()}
                        onDrop={(ev) => { ev.preventDefault(); handleBlockDrop(sectionKey, blockKey, group.matches); }}
                        className={`transition-colors ${isDraggingThis ? 'opacity-40' : ''} ${
                          hasIssue
                            ? 'bg-red-950/20 hover:bg-red-950/30'
                            : isWalkover
                            ? 'opacity-50'
                            : 'hover:bg-surface/20'
                        }`}
                      >
                        <td className="px-2 py-2.5 text-xs text-slate-500">
                          <div className="flex items-center gap-1.5">
                            {isFirstOfBlock ? (
                              <span
                                draggable
                                onDragStart={() => setDragState({ sectionKey, blockKey })}
                                onDragEnd={() => setDragState(null)}
                                title="Drag to reorder this match (or whole tie)"
                                className="flex h-6 w-6 shrink-0 items-center justify-center rounded cursor-grab active:cursor-grabbing text-base leading-none text-slate-400 bg-surface-border/40 hover:bg-surface-border hover:text-white transition-colors select-none"
                              >
                                ⠿
                              </span>
                            ) : (
                              <span className="w-6 shrink-0" />
                            )}
                            {idx + 1}
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          {/* Player names — team-event rows get a header line with the two
                              team names + rubber tag, then the actual lineup underneath
                              (or "Awaiting lineup" until the captain submits one). */}
                          {m.team_a_name || m.team_b_name ? (
                            <>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-sm font-semibold text-brand-300">{m.team_a_name}</span>
                                <span className="text-slate-500 text-xs">vs</span>
                                <span className="text-sm font-semibold text-brand-300">{m.team_b_name}</span>
                                {m.rubber_label && (
                                  <span className="rounded bg-surface px-1.5 py-0.5 text-[10px] font-medium text-brand-300 ring-1 ring-surface-border">
                                    {m.rubber_label}
                                  </span>
                                )}
                              </div>
                              {m.player_a || m.player_b ? (
                                <p className="text-xs text-slate-400 mt-0.5">
                                  {m.player_a || 'TBD'} <span className="text-slate-600">vs</span> {m.player_b || 'TBD'}
                                </p>
                              ) : (
                                <p className="text-xs text-slate-600 italic mt-0.5">Awaiting lineup</p>
                              )}
                            </>
                          ) : (
                            <div className="flex items-center gap-1 flex-wrap">
                              <span className={m.player_a_is_placeholder ? 'text-sm text-slate-400 italic' : 'text-sm font-medium text-white'}>{m.player_a}</span>
                              <span className="text-slate-500 text-xs">vs</span>
                              <span className={m.player_b_is_placeholder ? 'text-sm text-slate-400 italic' : 'text-sm font-medium text-white'}>{m.player_b}</span>
                            </div>
                          )}
                          <div className="mt-1 flex items-center gap-1 flex-wrap">
                            {isWalkover && (
                              <span className="rounded-full bg-amber-900/30 px-2 py-0.5 text-[10px] font-semibold text-amber-400">
                                Walkover
                              </span>
                            )}
                            {conflict && (
                              <span className="rounded px-1.5 py-0.5 text-[10px] bg-red-900/40 text-red-300" title={conflict}>
                                ⚠️ Conflict
                              </span>
                            )}
                            {courtInvalid && (
                              <span className="rounded px-1.5 py-0.5 text-[10px] bg-amber-900/40 text-amber-300">
                                ⚠️ Court removed
                              </span>
                            )}
                          </div>
                          {(conflict || courtInvalid) && (
                            <p className="mt-0.5 text-[10px] text-red-400/80 truncate">
                              {conflict ?? 'Court no longer available — please reassign'}
                            </p>
                          )}
                          {/* Mobile-only: date/time + court inputs inline below names */}
                          <div className="mt-2 flex items-center gap-2 sm:hidden">
                            <input
                              type="datetime-local"
                              value={e.time}
                              disabled={isWalkover}
                              onChange={(ev) => updateEdit(m.id, { time: ev.target.value })}
                              className="block min-w-0 flex-[3] rounded border border-slate-700 bg-surface px-2 py-1.5 text-xs text-white outline-none focus:border-brand-500 disabled:opacity-40"
                            />
                            <input
                              type="number"
                              min={1}
                              max={courtCount}
                              placeholder="Ct"
                              value={e.court}
                              disabled={isWalkover}
                              onChange={(ev) => updateEdit(m.id, { court: ev.target.value })}
                              className={`block flex-1 min-w-0 rounded border bg-surface px-2 py-1.5 text-xs text-white outline-none focus:border-brand-500 disabled:opacity-40 ${courtInvalid ? 'border-amber-700' : 'border-slate-700'}`}
                            />
                          </div>
                        </td>
                        <td className="hidden sm:table-cell px-4 py-2.5">
                          <input
                            type="datetime-local"
                            value={e.time}
                            disabled={isWalkover}
                            onChange={(ev) => updateEdit(m.id, { time: ev.target.value })}
                            className={inputCls}
                          />
                        </td>
                        <td className="hidden sm:table-cell px-4 py-2.5">
                          <input
                            type="number"
                            min={1}
                            max={courtCount}
                            placeholder="—"
                            value={e.court}
                            disabled={isWalkover}
                            onChange={(ev) => updateEdit(m.id, { court: ev.target.value })}
                            className={`${inputCls} ${courtInvalid ? 'border-amber-700' : ''}`}
                          />
                        </td>
                      </tr>
                    );
                  });
                  })()}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>

      {/* ── AI panel — fixed overlay sidebar, never compresses main content ─ */}
      {showAI && (
        <>
          {/* Backdrop — click to close */}
          <div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
            onClick={() => setShowAI(false)}
          />

          {/* Side panel — desktop (right slide-in) */}
          <div className="hidden md:flex fixed right-0 top-0 bottom-0 z-50 w-96 flex-col border-l border-surface-border bg-[#0d111f] shadow-2xl">
            <ScheduleAIPanel
              tournamentSlug={tournamentSlug}
              currentSchedule={currentScheduleForAI}
              availableCourts={availableCourts}
              matchDurationMins={matchDurationMins}
              onApplyUpdates={handleApplyAI}
              onClose={() => setShowAI(false)}
              aiConfigured={aiConfigured}
            />
          </div>

          {/* Bottom sheet — mobile */}
          <div className="md:hidden fixed inset-x-0 bottom-0 z-50 h-[70vh] rounded-t-2xl overflow-hidden border-t border-surface-border bg-[#0d111f] shadow-2xl">
            <ScheduleAIPanel
              tournamentSlug={tournamentSlug}
              currentSchedule={currentScheduleForAI}
              availableCourts={availableCourts}
              matchDurationMins={matchDurationMins}
              onApplyUpdates={handleApplyAI}
              onClose={() => setShowAI(false)}
              aiConfigured={aiConfigured}
            />
          </div>
        </>
      )}

      {/* ── Sticky save footer ────────────────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-surface-border bg-surface/95 backdrop-blur-sm shadow-2xl">
        <div className="mx-auto max-w-4xl flex items-center justify-between px-6 py-4">
          <div className="text-xs text-slate-500">
            {totalDirty > 0
              ? <span className="text-amber-300">{totalDirty} unsaved change{totalDirty !== 1 ? 's' : ''}</span>
              : <span>Schedule is up to date</span>
            }
            {conflicts.length > 0 && (
              <span className="ml-3 text-red-400">⚠️ {conflicts.length} conflict{conflicts.length !== 1 ? 's' : ''}</span>
            )}
          </div>
          <button
            onClick={handleSave}
            disabled={saving || totalDirty === 0}
            className="rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save schedule'}
          </button>
        </div>
      </div>

      {/* ── Schedule settings modal ────────────────────────────────────────── */}
      {showModal && (
        <ScheduleSettingsModal
          startDate={startDate}
          courtCount={courtCount}
          suggestedMatchDuration={matchDurationMins}
          defaultChangeoverMins={changeoverMins}
          defaultStartTime={defaultStartTime}
          generating={generating}
          onGenerate={handleGenerate}
          onClose={() => setShowModal(false)}
          categoryPreview={categories.map((cat) => ({
            name: cat.name,
            matchCount: matches.filter((m) => m.category_id === cat.id).length,
            durationMins: categoryDurationMins[cat.id] ?? matchDurationMins,
          }))}
        />
      )}
    </div>
  );
}
