'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { reorderRubberLineupAction } from '@/lib/actions/teams';

interface RubberRow {
  sequence: number;
  name: string;
  play_format: string;
}

const FORMAT_LABEL: Record<string, string> = {
  singles: 'Singles',
  doubles: 'Doubles',
  mixed_doubles: 'Mixed Doubles',
};

/** Post-draw-only: the set of rubbers can't change once ties exist, but the
 *  order they're played in is just metadata — safe to reorder as long as
 *  nothing has started yet. Reorders both the category's rubber_lineup and
 *  every tie's matching rubber_sequence in one action. */
export function RubberOrderEditor({ categoryId, rubberLineup }: { categoryId: string; rubberLineup: RubberRow[] }) {
  const router = useRouter();
  const [order, setOrder] = useState(() => [...rubberLineup].sort((a, b) => a.sequence - b.sequence));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (order.length <= 1) return null;

  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    [next[index], next[target]] = [next[target], next[index]];
    setOrder(next);
    setSuccess(false);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSuccess(false);
    const result = await reorderRubberLineupAction(categoryId, order.map((r) => r.sequence));
    if ('error' in result) setError(result.error);
    else { setSuccess(true); router.refresh(); }
    setSaving(false);
  }

  return (
    <div className="rounded-lg border border-surface-border bg-surface px-4 py-3 space-y-2">
      <p className="text-xs font-semibold text-slate-300">
        Rubber order <span className="text-slate-500">(the lineup itself is locked now the draw exists — only play order can change)</span>
      </p>
      {order.map((r, i) => (
        <div key={r.sequence} className="flex items-center gap-2">
          <span className="w-6 text-xs text-slate-500">{i + 1}.</span>
          <span className="flex-1 text-sm text-white">{r.name}</span>
          <span className="text-xs text-slate-500">{FORMAT_LABEL[r.play_format] ?? r.play_format}</span>
          <button
            type="button"
            onClick={() => move(i, -1)}
            disabled={i === 0}
            className="px-1.5 text-slate-400 hover:text-white disabled:opacity-30 transition-colors"
            title="Move up"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => move(i, 1)}
            disabled={i === order.length - 1}
            className="px-1.5 text-slate-400 hover:text-white disabled:opacity-30 transition-colors"
            title="Move down"
          >
            ↓
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save order'}
      </button>
      {error && <p className="text-xs text-red-400">{error}</p>}
      {success && <p className="text-xs text-accent-400">Order saved.</p>}
    </div>
  );
}
