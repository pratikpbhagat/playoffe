'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateCategoryScheduleOrderAction } from '@/lib/actions/scheduling';

interface CategoryItem {
  id: string;
  name: string;
  day: string; // "YYYY-MM-DD"
  order: number;
  matchCount: number;
}

interface Props {
  tournamentSlug: string;
  /** Every calendar day the tournament spans, in order ("YYYY-MM-DD") */
  days: string[];
  initialCategories: CategoryItem[];
}

// Parses "YYYY-MM-DD" as a UTC calendar date and formats it back in UTC, so
// the displayed day never shifts based on the viewer's local timezone offset
// (e.g. `new Date("2026-07-04T00:00:00")` parsed as local time in a UTC+ zone
// rolls back to July 3rd once converted — this avoids that entirely).
function formatDay(d: string) {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString('en-AU', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
  });
}

/**
 * Drag-and-drop running order for categories — which day each category's
 * matches run on, and the sequence they run in relative to other categories
 * on that day. Saving resets the existing schedule (per-category timings
 * depend entirely on this order), so the organiser has to re-run
 * "Schedule all matches" afterwards.
 */
export function CategoryScheduleOrder({ tournamentSlug, days, initialCategories }: Props) {
  const router = useRouter();
  const [categories, setCategories] = useState(initialCategories);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dragId = useRef<string | null>(null);
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);

  const byDay = useMemo(() => {
    const map = new Map<string, CategoryItem[]>();
    for (const day of days) map.set(day, []);
    for (const cat of [...categories].sort((a, b) => a.order - b.order)) {
      // Fall back to the first day rather than dropping the category into an
      // unrendered column it can never be dragged out of.
      const day = days.includes(cat.day) ? cat.day : days[0];
      map.get(day)?.push(cat);
    }
    return map;
  }, [categories, days]);

  function moveCategory(categoryId: string, targetDay: string, targetIndex: number) {
    setCategories((prev) => {
      const moving = prev.find((c) => c.id === categoryId);
      if (!moving) return prev;

      // Rebuild each day's list, removing the dragged item from wherever it was
      const byDayLocal = new Map<string, CategoryItem[]>();
      for (const day of days) byDayLocal.set(day, []);
      for (const cat of [...prev].sort((a, b) => a.order - b.order)) {
        if (cat.id === categoryId) continue;
        if (!byDayLocal.has(cat.day)) byDayLocal.set(cat.day, []);
        byDayLocal.get(cat.day)!.push(cat);
      }

      const targetList = byDayLocal.get(targetDay) ?? [];
      const clampedIndex = Math.max(0, Math.min(targetIndex, targetList.length));
      targetList.splice(clampedIndex, 0, { ...moving, day: targetDay });
      byDayLocal.set(targetDay, targetList);

      const next: CategoryItem[] = [];
      for (const [day, list] of byDayLocal) {
        list.forEach((cat, i) => next.push({ ...cat, day, order: i }));
      }
      return next;
    });
    setDirty(true);
    setError(null);
  }

  async function handleConfirm() {
    setSaving(true);
    setError(null);
    const result = await updateCategoryScheduleOrderAction(
      tournamentSlug,
      categories.map((c) => ({ categoryId: c.id, day: c.day, order: c.order })),
    );
    setSaving(false);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    setDirty(false);
    router.refresh();
  }

  function handleCancel() {
    setCategories(initialCategories);
    setDirty(false);
    setError(null);
  }

  return (
    <section className="mb-8">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Running order</h2>
          <p className="mt-0.5 text-xs text-slate-600">
            Drag categories to set the day and order they're scheduled in.
          </p>
        </div>
        {dirty && (
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-amber-400">Order changed — re-run "Schedule all matches" after saving</span>
            <button
              onClick={handleCancel}
              disabled={saving}
              className="whitespace-nowrap rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-400 hover:text-white transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={saving}
              className="whitespace-nowrap rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Confirm order'}
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-red-800 bg-red-950 px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Stretch to fill the available width, but cap at 2 columns so each
          category card stays clearly readable even with many tournament days. */}
      <div className={`grid gap-3 ${days.length > 1 ? 'sm:grid-cols-2' : ''}`}>
        {days.map((day) => {
          const list = byDay.get(day) ?? [];
          return (
            <div
              key={day}
              className={`rounded-xl ring-1 transition-colors ${
                dragOverDay === day ? 'ring-brand-500 bg-brand-950/10' : 'ring-surface-border bg-surface-card'
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragOverDay(day); }}
              onDragLeave={() => setDragOverDay((d) => (d === day ? null : d))}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverDay(null);
                if (dragId.current) moveCategory(dragId.current, day, list.length);
                dragId.current = null;
              }}
            >
              {days.length > 1 && (
                <div className="border-b border-surface-border px-3 py-2">
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-300">{formatDay(day)}</p>
                </div>
              )}
              <div className="p-2 space-y-1.5 min-h-[3rem]">
                {list.length === 0 && (
                  <p className="px-2 py-3 text-center text-[11px] text-slate-600">Drop a category here</p>
                )}
                {list.map((cat, idx) => (
                  <div
                    key={cat.id}
                    draggable
                    onDragStart={() => { dragId.current = cat.id; }}
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOverDay(day); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDragOverDay(null);
                      if (dragId.current) moveCategory(dragId.current, day, idx);
                      dragId.current = null;
                    }}
                    className="flex cursor-grab items-center gap-2 rounded-lg border border-slate-700 bg-surface px-3 py-2 text-sm text-white active:cursor-grabbing"
                  >
                    <span className="text-slate-500 text-xs">⠿</span>
                    <span className="flex-1 truncate">{cat.name}</span>
                    <span className="shrink-0 text-[10px] text-slate-500">{cat.matchCount} matches</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
