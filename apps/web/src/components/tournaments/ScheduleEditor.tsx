'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
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
  courtCount: number;
  startDate: string; // YYYY-MM-DD — default for auto-fill
  matches: MatchForScheduling[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function pad(n: number) {
  return String(n).padStart(2, '0');
}

/** UTC ISO → datetime-local string (browser local time) */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** datetime-local string → UTC ISO (or null if empty) */
function fromLocalInput(local: string): string | null {
  if (!local) return null;
  return new Date(local).toISOString();
}

// ── Component ──────────────────────────────────────────────────────────────────

export function ScheduleEditor({ tournamentSlug, courtCount, startDate, matches }: Props) {
  // Per-match edit state: matchId → { time: datetime-local, court: string }
  const [edits, setEdits] = useState<Record<string, { time: string; court: string }>>(() => {
    const init: Record<string, { time: string; court: string }> = {};
    for (const m of matches) {
      init[m.id] = { time: toLocalInput(m.scheduled_time), court: m.court?.toString() ?? '' };
    }
    return init;
  });

  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok?: string; err?: string } | null>(null);

  // Auto-fill controls
  const [fillDatetime, setFillDatetime] = useState(`${startDate}T09:00`);
  const [fillInterval, setFillInterval] = useState(30);
  const [fillCourts, setFillCourts] = useState(Math.min(courtCount, 4));

  function updateEdit(id: string, field: 'time' | 'court', value: string) {
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
    setSaveMsg(null);
  }

  // ── Auto-fill unscheduled matches ────────────────────────────────────────────
  function handleAutoFill() {
    const unscheduled = matches.filter(
      (m) => m.status === 'scheduled' && !edits[m.id]?.time,
    );
    if (unscheduled.length === 0) {
      setSaveMsg({ err: 'No unscheduled matches to fill.' });
      return;
    }

    // Sort: category first, then round
    const sorted = [...unscheduled].sort((a, b) => {
      if (a.category_id !== b.category_id) return a.category_id.localeCompare(b.category_id);
      return a.round - b.round;
    });

    const base = new Date(fillDatetime);
    if (isNaN(base.getTime())) {
      setSaveMsg({ err: 'Invalid start date/time.' });
      return;
    }

    setEdits((prev) => {
      const next = { ...prev };
      sorted.forEach((m, i) => {
        const courtNum = (i % fillCourts) + 1;
        const minuteOffset = Math.floor(i / fillCourts) * fillInterval;
        const matchTime = new Date(base.getTime() + minuteOffset * 60_000);
        const timeStr = `${matchTime.getFullYear()}-${pad(matchTime.getMonth() + 1)}-${pad(matchTime.getDate())}T${pad(matchTime.getHours())}:${pad(matchTime.getMinutes())}`;
        next[m.id] = { time: timeStr, court: courtNum.toString() };
      });
      return next;
    });
    setSaveMsg(null);
  }

  // ── Save all editable matches ─────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true);
    setSaveMsg(null);

    const updates = matches
      .filter((m) => m.status === 'scheduled')
      .map((m) => ({
        matchId: m.id,
        scheduledTime: fromLocalInput(edits[m.id]?.time ?? ''),
        court: parseInt(edits[m.id]?.court ?? '', 10) || null,
      }));

    const result = await batchScheduleMatchesAction(tournamentSlug, updates);

    if (result.error) {
      setSaveMsg({ err: result.error });
    } else {
      // Sync baseline to match saved state
      setSaveMsg({ ok: `Saved ${result.count} match${result.count !== 1 ? 'es' : ''}.` });
    }
    setSaving(false);
  }

  // ── Dirty-count (edits differ from DB values) ─────────────────────────────────
  const dirtyCount = useMemo(
    () =>
      matches.filter((m) => {
        if (m.status !== 'scheduled') return false;
        const orig = { time: toLocalInput(m.scheduled_time), court: m.court?.toString() ?? '' };
        const curr = edits[m.id] ?? orig;
        return curr.time !== orig.time || curr.court !== orig.court;
      }).length,
    [matches, edits],
  );

  // ── Group by category ─────────────────────────────────────────────────────────
  const groups = useMemo(() => {
    const map = new Map<string, { name: string; matches: MatchForScheduling[] }>();
    for (const m of matches) {
      if (!map.has(m.category_id)) map.set(m.category_id, { name: m.category_name, matches: [] });
      map.get(m.category_id)!.matches.push(m);
    }
    return Array.from(map.values());
  }, [matches]);

  const inputCls =
    'block w-full rounded border border-slate-700 bg-surface px-2 py-1.5 text-xs text-white outline-none focus:border-brand-500 disabled:opacity-40';

  return (
    <div className="space-y-6 pb-28">
      {/* ── Auto-fill panel ─────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-surface-card p-5 ring-1 ring-surface-border">
        <h2 className="mb-1 text-sm font-semibold text-white">Auto-schedule</h2>
        <p className="mb-4 text-xs text-slate-500">
          Distribute all currently unscheduled matches across courts starting from a chosen time.
        </p>
        <div className="flex flex-wrap items-end gap-4">
          <label className="space-y-1">
            <span className="text-xs text-slate-400">Start date &amp; time</span>
            <input
              type="datetime-local"
              value={fillDatetime}
              onChange={(e) => setFillDatetime(e.target.value)}
              className="block rounded-lg border border-slate-700 bg-surface px-3 py-2 text-sm text-white outline-none focus:border-brand-500"
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs text-slate-400">Min per match</span>
            <input
              type="number"
              min={5}
              max={180}
              value={fillInterval}
              onChange={(e) => setFillInterval(parseInt(e.target.value) || 30)}
              className="block w-24 rounded-lg border border-slate-700 bg-surface px-3 py-2 text-sm text-white outline-none focus:border-brand-500"
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs text-slate-400">Courts to use</span>
            <input
              type="number"
              min={1}
              max={courtCount || 20}
              value={fillCourts}
              onChange={(e) => setFillCourts(Math.max(1, parseInt(e.target.value) || 1))}
              className="block w-20 rounded-lg border border-slate-700 bg-surface px-3 py-2 text-sm text-white outline-none focus:border-brand-500"
            />
          </label>

          <button
            onClick={handleAutoFill}
            className="rounded-lg border border-brand-600/50 bg-brand-600/20 px-4 py-2 text-sm font-semibold text-brand-300 hover:bg-brand-600/30 transition-colors"
          >
            ⚡ Auto-fill
          </button>
        </div>
      </div>

      {/* ── Match tables grouped by category ────────────────────────────────── */}
      {groups.map((group) => (
        <div
          key={group.name}
          className="rounded-xl bg-surface-card ring-1 ring-surface-border overflow-hidden"
        >
          <div className="border-b border-surface-border px-5 py-3">
            <h3 className="text-sm font-semibold text-white">{group.name}</h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-border text-left">
                  <th className="px-4 py-2.5 text-xs font-medium text-slate-500 w-24">Round</th>
                  <th className="px-4 py-2.5 text-xs font-medium text-slate-500">Match</th>
                  <th className="px-4 py-2.5 text-xs font-medium text-slate-500 w-52">
                    Date &amp; time
                  </th>
                  <th className="px-4 py-2.5 text-xs font-medium text-slate-500 w-20">Court</th>
                  <th className="px-4 py-2.5 text-xs font-medium text-slate-500 w-20 text-center">
                    Status
                  </th>
                  <th className="px-4 py-2.5 text-xs font-medium text-slate-500 w-16 text-right">
                    Score
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {group.matches.map((m) => {
                  const edit = edits[m.id] ?? { time: '', court: '' };
                  const origTime = toLocalInput(m.scheduled_time);
                  const origCourt = m.court?.toString() ?? '';
                  const isDirty =
                    m.status === 'scheduled' &&
                    (edit.time !== origTime || edit.court !== origCourt);
                  const isLocked = m.status !== 'scheduled';

                  return (
                    <tr
                      key={m.id}
                      className={isDirty ? 'bg-brand-900/20' : ''}
                    >
                      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                        {m.round_name ?? `Round ${m.round}`}
                        {m.group_name ? (
                          <span className="ml-1 text-slate-600">· {m.group_name}</span>
                        ) : null}
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
                          onChange={(e) => updateEdit(m.id, 'time', e.target.value)}
                          disabled={isLocked}
                          className={inputCls}
                        />
                      </td>

                      <td className="px-4 py-3">
                        <input
                          type="number"
                          min={1}
                          max={99}
                          value={edit.court}
                          onChange={(e) => updateEdit(m.id, 'court', e.target.value)}
                          placeholder="—"
                          disabled={isLocked}
                          className={`${inputCls} text-center`}
                        />
                      </td>

                      <td className="px-4 py-3 text-center">
                        {isLocked ? (
                          <span className="rounded-full bg-slate-700/50 px-2 py-0.5 text-[10px] font-medium text-slate-400">
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

                      {/* Per-match scoring hub link */}
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/tournaments/${tournamentSlug}/scoring/${m.id}`}
                          className="text-xs font-medium text-brand-400 hover:text-brand-300 transition-colors whitespace-nowrap"
                        >
                          Score →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {matches.length === 0 && (
        <div className="rounded-xl bg-surface-card p-10 text-center ring-1 ring-surface-border">
          <p className="text-2xl mb-2">📅</p>
          <p className="text-sm font-medium text-white mb-1">No matches to schedule yet</p>
          <p className="text-xs text-slate-500">
            Generate a draw for at least one category first.
          </p>
        </div>
      )}

      {/* ── Sticky save bar ──────────────────────────────────────────────────── */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-full max-w-2xl px-4">
        <div className="flex items-center gap-4 rounded-xl border border-surface-border bg-surface-card px-5 py-4 shadow-2xl shadow-black/60 ring-1 ring-surface-border">
          <div className="flex-1 min-w-0">
            {saveMsg?.err ? (
              <p className="text-sm text-red-400 truncate">{saveMsg.err}</p>
            ) : saveMsg?.ok ? (
              <p className="text-sm text-accent-400">{saveMsg.ok}</p>
            ) : dirtyCount > 0 ? (
              <p className="text-sm text-slate-300">
                <span className="font-bold text-white">{dirtyCount}</span> unsaved change
                {dirtyCount !== 1 ? 's' : ''}
              </p>
            ) : (
              <p className="text-sm text-slate-600">Schedule is up to date</p>
            )}
          </div>

          <button
            onClick={handleSave}
            disabled={saving || (dirtyCount === 0 && !saveMsg?.err)}
            className="shrink-0 rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save schedule'}
          </button>
        </div>
      </div>
    </div>
  );
}
