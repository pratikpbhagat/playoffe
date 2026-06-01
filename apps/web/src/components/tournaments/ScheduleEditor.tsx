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
  startDate: string;
  matches: MatchForScheduling[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

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

// ── Component ──────────────────────────────────────────────────────────────────

export function ScheduleEditor({ tournamentSlug, startDate, matches }: Props) {
  // Per-match edits: { time, court }
  const [edits, setEdits] = useState<Record<string, { time: string; court: string }>>(() => {
    const init: Record<string, { time: string; court: string }> = {};
    for (const m of matches) {
      init[m.id] = {
        time: toLocalInput(m.scheduled_time),
        court: m.court != null ? String(m.court) : '',
      };
    }
    return init;
  });

  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok?: string; err?: string } | null>(null);

  // ── Category list ─────────────────────────────────────────────────────────────
  const categories = useMemo(() => {
    const seen = new Map<string, { id: string; name: string }>();
    for (const m of matches) {
      if (!seen.has(m.category_id)) seen.set(m.category_id, { id: m.category_id, name: m.category_name });
    }
    return Array.from(seen.values());
  }, [matches]);

  const [activeCatId, setActiveCatId] = useState<string>(categories[0]?.id ?? '');

  // ── Per-group auto-fill state ─────────────────────────────────────────────────
  // Key: `${categoryId}::${groupKey}` where groupKey = group_name or '__ko__'
  const [groupFill, setGroupFill] = useState<Record<string, { datetime: string; interval: number; court: string }>>({});

  function gfKey(catId: string, groupKey: string) { return `${catId}::${groupKey}`; }

  function getGf(catId: string, groupKey: string) {
    return groupFill[gfKey(catId, groupKey)] ?? { datetime: `${startDate}T09:00`, interval: 30, court: '' };
  }

  function setGf(catId: string, groupKey: string, patch: Partial<{ datetime: string; interval: number; court: string }>) {
    setGroupFill((prev) => {
      const key = gfKey(catId, groupKey);
      return { ...prev, [key]: { ...getGf(catId, groupKey), ...patch } };
    });
  }

  // ── Edit helpers ──────────────────────────────────────────────────────────────
  function updateEdit(id: string, patch: Partial<{ time: string; court: string }>) {
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
    setSaveMsg(null);
  }

  // ── Auto-fill for a single group ──────────────────────────────────────────────
  function handleGroupAutoFill(catId: string, groupKey: string, groupMatches: MatchForScheduling[]) {
    const gf = getGf(catId, groupKey);
    const fillable = groupMatches.filter((m) => m.status === 'scheduled');
    if (fillable.length === 0) {
      setSaveMsg({ err: 'No schedulable matches in this group.' });
      return;
    }
    const base = new Date(gf.datetime);
    if (isNaN(base.getTime())) { setSaveMsg({ err: 'Invalid start date/time.' }); return; }

    const sorted = [...fillable].sort((a, b) => a.round - b.round);
    setEdits((prev) => {
      const next = { ...prev };
      sorted.forEach((m, i) => {
        next[m.id] = {
          time: toTimeString(base, i * gf.interval),
          court: gf.court || prev[m.id]?.court || '',
        };
      });
      return next;
    });
    setSaveMsg(null);
  }

  // ── Save all ──────────────────────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true);
    setSaveMsg(null);

    const updates = matches
      .filter((m) => m.status === 'scheduled')
      .map((m) => ({
        matchId: m.id,
        scheduledTime: fromLocalInput(edits[m.id]?.time ?? ''),
        court: edits[m.id]?.court ? parseInt(edits[m.id].court) : null,
      }));

    const result = await batchScheduleMatchesAction(tournamentSlug, updates);
    if (result.error) {
      setSaveMsg({ err: result.error });
    } else {
      setSaveMsg({ ok: `Saved ${result.count} match${result.count !== 1 ? 'es' : ''}.` });
    }
    setSaving(false);
  }

  // ── Dirty count ───────────────────────────────────────────────────────────────
  const dirtyCountByCat = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of matches) {
      if (m.status !== 'scheduled') continue;
      const origTime = toLocalInput(m.scheduled_time);
      const origCourt = m.court != null ? String(m.court) : '';
      const e = edits[m.id];
      if (!e) continue;
      if (e.time !== origTime || e.court !== origCourt) {
        counts[m.category_id] = (counts[m.category_id] ?? 0) + 1;
      }
    }
    return counts;
  }, [matches, edits]);

  const totalDirty = Object.values(dirtyCountByCat).reduce((a, b) => a + b, 0);

  // ── Active category — sorted + grouped ───────────────────────────────────────
  const activeGroups = useMemo(() => {
    const sorted = matches
      .filter((m) => m.category_id === activeCatId)
      .sort((a, b) => {
        const ga = a.group_name ?? '￿';
        const gb = b.group_name ?? '￿';
        if (ga !== gb) return ga.localeCompare(gb);
        return a.round - b.round;
      });

    const groupMap = new Map<string, MatchForScheduling[]>();
    for (const m of sorted) {
      const key = m.group_name ?? '__ko__';
      if (!groupMap.has(key)) groupMap.set(key, []);
      groupMap.get(key)!.push(m);
    }
    return Array.from(groupMap.entries()).map(([key, grpMatches]) => ({
      key,
      label: key === '__ko__' ? 'Knockout Stage' : key,
      matches: grpMatches,
    }));
  }, [matches, activeCatId]);

  const inputCls =
    'block w-full rounded border border-slate-700 bg-surface px-2 py-1.5 text-xs text-white outline-none focus:border-brand-500 disabled:opacity-40';

  if (matches.length === 0) {
    return (
      <div className="rounded-xl bg-surface-card p-10 text-center ring-1 ring-surface-border">
        <p className="text-2xl mb-2">📅</p>
        <p className="text-sm font-medium text-white mb-1">No matches to schedule yet</p>
        <p className="text-xs text-slate-500">Generate a draw for at least one category first.</p>
      </div>
    );
  }

  let globalMatchNum = 0;

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

      {/* ── One section per group ─────────────────────────────────────────────── */}
      {activeGroups.map((group) => {
        const gf = getGf(activeCatId, group.key);

        return (
          <div key={group.key} className="rounded-xl bg-surface-card ring-1 ring-surface-border overflow-hidden">
            {/* Group header + auto-fill controls */}
            <div className="border-b border-surface-border bg-surface px-4 py-3 space-y-3">
              <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
                {group.label}
              </p>

              {/* Auto-fill row */}
              <div className="flex flex-wrap items-end gap-3">
                <label className="space-y-1">
                  <span className="text-[10px] text-slate-500">Start time</span>
                  <input
                    type="datetime-local"
                    value={gf.datetime}
                    onChange={(e) => setGf(activeCatId, group.key, { datetime: e.target.value })}
                    className="block rounded border border-slate-700 bg-surface px-2.5 py-1.5 text-xs text-white outline-none focus:border-brand-500"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-[10px] text-slate-500">Min / match</span>
                  <input
                    type="number"
                    min={5}
                    max={180}
                    value={gf.interval}
                    onChange={(e) => setGf(activeCatId, group.key, { interval: parseInt(e.target.value) || 30 })}
                    className="block w-20 rounded border border-slate-700 bg-surface px-2.5 py-1.5 text-xs text-white outline-none focus:border-brand-500"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-[10px] text-slate-500">Default court</span>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    placeholder="—"
                    value={gf.court}
                    onChange={(e) => setGf(activeCatId, group.key, { court: e.target.value })}
                    className="block w-20 rounded border border-slate-700 bg-surface px-2.5 py-1.5 text-xs text-white outline-none focus:border-brand-500"
                  />
                </label>

                <button
                  onClick={() => handleGroupAutoFill(activeCatId, group.key, group.matches)}
                  className="self-end rounded border border-brand-600/50 bg-brand-600/20 px-3 py-1.5 text-xs font-semibold text-brand-300 hover:bg-brand-600/30 transition-colors"
                >
                  ⚡ Auto-fill
                </button>
              </div>
            </div>

            {/* Match rows */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-border text-left">
                    <th className="px-4 py-2 text-xs font-medium text-slate-500 w-10 text-center">#</th>
                    <th className="px-4 py-2 text-xs font-medium text-slate-500">Match</th>
                    <th className="px-4 py-2 text-xs font-medium text-slate-500 w-48">Date &amp; time</th>
                    <th className="px-4 py-2 text-xs font-medium text-slate-500 w-20 text-center">Court</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {group.matches.map((m) => {
                    globalMatchNum += 1;
                    const edit = edits[m.id] ?? { time: '', court: '' };
                    const origTime = toLocalInput(m.scheduled_time);
                    const origCourt = m.court != null ? String(m.court) : '';
                    const isDirty = m.status === 'scheduled' && (edit.time !== origTime || edit.court !== origCourt);
                    const isLocked = m.status !== 'scheduled';

                    return (
                      <tr key={m.id} className={isDirty ? 'bg-brand-900/20' : ''}>
                        <td className="px-4 py-2.5 text-xs font-medium text-slate-500 text-center tabular-nums">
                          {globalMatchNum}
                        </td>

                        <td className="px-4 py-2.5">
                          <p className="text-sm text-white whitespace-nowrap">
                            {m.player_a}
                            <span className="mx-2 text-slate-600">vs</span>
                            {m.player_b}
                          </p>
                        </td>

                        <td className="px-4 py-2.5">
                          <input
                            type="datetime-local"
                            value={edit.time}
                            onChange={(e) => updateEdit(m.id, { time: e.target.value })}
                            disabled={isLocked}
                            className={inputCls}
                          />
                        </td>

                        <td className="px-4 py-2.5">
                          <input
                            type="number"
                            min={1}
                            max={99}
                            placeholder="—"
                            value={edit.court}
                            onChange={(e) => updateEdit(m.id, { court: e.target.value })}
                            disabled={isLocked}
                            className={`${inputCls} text-center`}
                          />
                        </td>

                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {activeGroups.length === 0 && (
        <div className="rounded-xl bg-surface-card p-8 text-center ring-1 ring-surface-border">
          <p className="text-sm text-slate-500">No matches for this category yet.</p>
        </div>
      )}

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
                <span className="font-bold text-white">{totalDirty}</span> unsaved change{totalDirty !== 1 ? 's' : ''}
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
