'use client';

import React, { useState, useMemo } from 'react';
import { batchScheduleMatchesAction } from '@/lib/actions/scheduling';

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
}

interface Props {
  tournamentSlug: string;
  startDate: string; // YYYY-MM-DD — default for auto-fill
  matches: MatchForScheduling[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(local: string): string | null {
  if (!local) return null;
  return new Date(local).toISOString();
}

// ── Component ──────────────────────────────────────────────────────────────────

export function ScheduleEditor({ tournamentSlug, startDate, matches }: Props) {
  // Per-match edit state: matchId → { time: datetime-local }
  const [edits, setEdits] = useState<Record<string, { time: string }>>(() => {
    const init: Record<string, { time: string }> = {};
    for (const m of matches) {
      init[m.id] = { time: toLocalInput(m.scheduled_time) };
    }
    return init;
  });

  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok?: string; err?: string } | null>(null);

  // ── Derive category list (ordered by first appearance in matches array) ────────
  const categories = useMemo(() => {
    const seen = new Map<string, { id: string; name: string }>();
    for (const m of matches) {
      if (!seen.has(m.category_id)) {
        seen.set(m.category_id, { id: m.category_id, name: m.category_name });
      }
    }
    return Array.from(seen.values());
  }, [matches]);

  const [activeCatId, setActiveCatId] = useState<string>(categories[0]?.id ?? '');

  // Per-category auto-fill controls
  const [fillDatetime, setFillDatetime] = useState<Record<string, string>>({});
  const [fillInterval, setFillInterval] = useState<Record<string, number>>({});

  function getFillDatetime(catId: string) {
    return fillDatetime[catId] ?? `${startDate}T09:00`;
  }
  function getFillInterval(catId: string) {
    return fillInterval[catId] ?? 30;
  }

  function updateTime(id: string, value: string) {
    setEdits((prev) => ({ ...prev, [id]: { time: value } }));
    setSaveMsg(null);
  }

  // ── Auto-fill for a single category ──────────────────────────────────────────
  function handleAutoFill(catId: string) {
    const unscheduled = matches.filter(
      (m) => m.category_id === catId && m.status === 'scheduled' && !edits[m.id]?.time,
    );
    if (unscheduled.length === 0) {
      setSaveMsg({ err: 'No unscheduled matches to fill in this category.' });
      return;
    }

    const sorted = [...unscheduled].sort((a, b) => {
      if ((a.group_name ?? '') !== (b.group_name ?? '')) {
        return (a.group_name ?? '').localeCompare(b.group_name ?? '');
      }
      return a.round - b.round;
    });

    const base = new Date(getFillDatetime(catId));
    if (isNaN(base.getTime())) {
      setSaveMsg({ err: 'Invalid start date/time.' });
      return;
    }

    const interval = getFillInterval(catId);
    setEdits((prev) => {
      const next = { ...prev };
      sorted.forEach((m, i) => {
        const matchTime = new Date(base.getTime() + i * interval * 60_000);
        next[m.id] = {
          time: `${matchTime.getFullYear()}-${pad(matchTime.getMonth() + 1)}-${pad(matchTime.getDate())}T${pad(matchTime.getHours())}:${pad(matchTime.getMinutes())}`,
        };
      });
      return next;
    });
    setSaveMsg(null);
  }

  // ── Save all changes across all categories ─────────────────────────────────────
  async function handleSave() {
    setSaving(true);
    setSaveMsg(null);

    const updates = matches
      .filter((m) => m.status === 'scheduled')
      .map((m) => ({
        matchId: m.id,
        scheduledTime: fromLocalInput(edits[m.id]?.time ?? ''),
        court: null,
      }));

    const result = await batchScheduleMatchesAction(tournamentSlug, updates);

    if (result.error) {
      setSaveMsg({ err: result.error });
    } else {
      setSaveMsg({ ok: `Saved ${result.count} match${result.count !== 1 ? 'es' : ''}.` });
    }
    setSaving(false);
  }

  // ── Dirty counts ──────────────────────────────────────────────────────────────
  const dirtyCountByCat = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of matches) {
      if (m.status !== 'scheduled') continue;
      const origTime = toLocalInput(m.scheduled_time);
      const currTime = edits[m.id]?.time ?? origTime;
      if (currTime !== origTime) {
        counts[m.category_id] = (counts[m.category_id] ?? 0) + 1;
      }
    }
    return counts;
  }, [matches, edits]);

  const totalDirty = Object.values(dirtyCountByCat).reduce((a, b) => a + b, 0);

  const inputCls =
    'block w-full rounded border border-slate-700 bg-surface px-2 py-1.5 text-xs text-white outline-none focus:border-brand-500 disabled:opacity-40';

  // Active category matches sorted: group A→Z first (null = knockout, last), then by round
  const activeMatches = useMemo(() => {
    return matches
      .filter((m) => m.category_id === activeCatId)
      .sort((a, b) => {
        const ga = a.group_name ?? '￿'; // null groups sort after named groups
        const gb = b.group_name ?? '￿';
        if (ga !== gb) return ga.localeCompare(gb);
        return a.round - b.round;
      });
  }, [matches, activeCatId]);

  if (matches.length === 0) {
    return (
      <div className="rounded-xl bg-surface-card p-10 text-center ring-1 ring-surface-border">
        <p className="text-2xl mb-2">📅</p>
        <p className="text-sm font-medium text-white mb-1">No matches to schedule yet</p>
        <p className="text-xs text-slate-500">Generate a draw for at least one category first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-28">
      {/* ── Category selector ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <label className="text-xs font-medium text-slate-400 shrink-0">Category</label>
        <div className="relative flex-1 max-w-sm">
          <select
            value={activeCatId}
            onChange={(e) => { setActiveCatId(e.target.value); setSaveMsg(null); }}
            className="w-full appearance-none rounded-lg border border-slate-600 bg-surface-card px-4 py-2 pr-9 text-sm text-white outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 cursor-pointer"
          >
            {categories.map((cat) => {
              const dirty = dirtyCountByCat[cat.id] ?? 0;
              return (
                <option key={cat.id} value={cat.id}>
                  {cat.name}{dirty > 0 ? ` (${dirty} unsaved)` : ''}
                </option>
              );
            })}
          </select>
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">▾</span>
        </div>
      </div>

      {/* ── Auto-schedule for active category ────────────────────────────────── */}
      <div className="rounded-xl bg-surface-card p-5 ring-1 ring-surface-border">
        <h2 className="mb-1 text-sm font-semibold text-white">Auto-schedule</h2>
        <p className="mb-4 text-xs text-slate-500">
          Assign times to all unscheduled matches in this category starting from the chosen time.
        </p>
        <div className="flex flex-wrap items-end gap-4">
          <label className="space-y-1">
            <span className="text-xs text-slate-400">Start date &amp; time</span>
            <input
              type="datetime-local"
              value={getFillDatetime(activeCatId)}
              onChange={(e) =>
                setFillDatetime((prev) => ({ ...prev, [activeCatId]: e.target.value }))
              }
              className="block rounded-lg border border-slate-700 bg-surface px-3 py-2 text-sm text-white outline-none focus:border-brand-500"
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs text-slate-400">Min per match</span>
            <input
              type="number"
              min={5}
              max={180}
              value={getFillInterval(activeCatId)}
              onChange={(e) =>
                setFillInterval((prev) => ({
                  ...prev,
                  [activeCatId]: parseInt(e.target.value) || 30,
                }))
              }
              className="block w-24 rounded-lg border border-slate-700 bg-surface px-3 py-2 text-sm text-white outline-none focus:border-brand-500"
            />
          </label>

          <button
            onClick={() => handleAutoFill(activeCatId)}
            className="rounded-lg border border-brand-600/50 bg-brand-600/20 px-4 py-2 text-sm font-semibold text-brand-300 hover:bg-brand-600/30 transition-colors"
          >
            ⚡ Auto-fill
          </button>
        </div>
      </div>

      {/* ── Match table for active category ──────────────────────────────────── */}
      <div className="rounded-xl bg-surface-card ring-1 ring-surface-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-border text-left">
                <th className="px-4 py-2.5 text-xs font-medium text-slate-500 w-12 text-center">#</th>
                <th className="px-4 py-2.5 text-xs font-medium text-slate-500">Match</th>
                <th className="px-4 py-2.5 text-xs font-medium text-slate-500 w-52">
                  Date &amp; time
                </th>
                <th className="px-4 py-2.5 text-xs font-medium text-slate-500 w-24 text-center">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const rows: React.ReactNode[] = [];
                let lastGroup: string | null | undefined = undefined; // sentinel
                let matchNum = 0;

                for (const m of activeMatches) {
                  // Insert a group header row whenever the group_name changes
                  if (m.group_name !== lastGroup) {
                    lastGroup = m.group_name;
                    const label = m.group_name ?? 'Knockout Stage';
                    rows.push(
                      <tr key={`header-${label}`} className="border-t border-surface-border">
                        <td
                          colSpan={4}
                          className="bg-surface px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-slate-500"
                        >
                          {label}
                        </td>
                      </tr>,
                    );
                  }

                  matchNum += 1;
                  const edit = edits[m.id] ?? { time: '' };
                  const origTime = toLocalInput(m.scheduled_time);
                  const isDirty = m.status === 'scheduled' && edit.time !== origTime;
                  const isLocked = m.status !== 'scheduled';

                  rows.push(
                    <tr
                      key={m.id}
                      className={`border-t border-surface-border ${isDirty ? 'bg-brand-900/20' : ''}`}
                    >
                      <td className="px-4 py-3 text-xs font-medium text-slate-500 text-center tabular-nums">
                        {matchNum}
                      </td>

                      <td className="px-4 py-3">
                        <p className="text-sm text-white whitespace-nowrap">
                          {m.player_a}
                          <span className="mx-2 text-slate-600">vs</span>
                          {m.player_b}
                        </p>
                      </td>

                      <td className="px-4 py-3">
                        <input
                          type="datetime-local"
                          value={edit.time}
                          onChange={(e) => updateTime(m.id, e.target.value)}
                          disabled={isLocked}
                          className={inputCls}
                        />
                      </td>

                      <td className="px-4 py-3 text-center">
                        {isLocked ? (
                          <span className="rounded-full bg-slate-700/50 px-2 py-0.5 text-[10px] font-medium text-slate-400 capitalize">
                            {m.status}
                          </span>
                        ) : isDirty ? (
                          <span className="text-xs text-brand-400">unsaved</span>
                        ) : edit.time ? (
                          <span className="text-xs text-accent-500">✓</span>
                        ) : (
                          <span className="text-xs text-slate-700">—</span>
                        )}
                      </td>
                    </tr>,
                  );
                }

                return rows;
              })()}

              {activeMatches.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-500">
                    No matches for this category yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Sticky save bar ───────────────────────────────────────────────────── */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-full max-w-2xl px-4">
        <div className="flex items-center gap-4 rounded-xl border border-surface-border bg-surface-card px-5 py-4 shadow-2xl shadow-black/60 ring-1 ring-surface-border">
          <div className="flex-1 min-w-0">
            {saveMsg?.err ? (
              <p className="text-sm text-red-400 truncate">{saveMsg.err}</p>
            ) : saveMsg?.ok ? (
              <p className="text-sm text-accent-400">{saveMsg.ok}</p>
            ) : totalDirty > 0 ? (
              <p className="text-sm text-slate-300">
                <span className="font-bold text-white">{totalDirty}</span> unsaved change
                {totalDirty !== 1 ? 's' : ''} across all categories
              </p>
            ) : (
              <p className="text-sm text-slate-600">Schedule is up to date</p>
            )}
          </div>

          <button
            onClick={handleSave}
            disabled={saving || (totalDirty === 0 && !saveMsg?.err)}
            className="shrink-0 rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save schedule'}
          </button>
        </div>
      </div>
    </div>
  );
}
