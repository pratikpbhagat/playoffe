'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { bulkUpdateSeedsAction } from '@/lib/actions/categories';

interface Player {
  id: string;
  full_name: string;
  username: string;
  photo_url: string | null;
  global_stats: { current_rating: number } | null;
}

interface Partner {
  id: string;
  full_name: string;
  username: string;
}

interface Entry {
  id: string;
  seed: number | null;
  registered_at: string;
  players: Player | null;
  partner?: Partner | null;
}

interface Props {
  entries: Entry[];
  categoryId: string;
  tournamentId: string;
}

export function SeedingPanel({ entries, categoryId, tournamentId }: Props) {
  const router = useRouter();

  // Build initial ordered list: seeded entries first (by seed asc), then unseeded by rating desc
  const buildInitialOrder = useCallback((raw: Entry[]) => {
    const seeded = [...raw]
      .filter((e) => e.seed !== null)
      .sort((a, b) => (a.seed ?? 0) - (b.seed ?? 0));
    const unseeded = [...raw]
      .filter((e) => e.seed === null)
      .sort((a, b) => {
        const ra = a.players?.global_stats?.current_rating ?? 0;
        const rb = b.players?.global_stats?.current_rating ?? 0;
        return rb - ra;
      });
    return [...seeded, ...unseeded];
  }, []);

  const [order, setOrder] = useState<Entry[]>(() => buildInitialOrder(entries));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allSeeded = entries.every((e) => e.seed !== null);

  function moveUp(index: number) {
    if (index === 0) return;
    setOrder((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
    setSaved(false);
  }

  function moveDown(index: number) {
    if (index === order.length - 1) return;
    setOrder((prev) => {
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
    setSaved(false);
  }

  function handleAutoSeed() {
    const byRating = [...entries].sort((a, b) => {
      const ra = a.players?.global_stats?.current_rating ?? 0;
      const rb = b.players?.global_stats?.current_rating ?? 0;
      return rb - ra;
    });
    setOrder(byRating);
    setSaved(false);
  }

  function handleClearSeeds() {
    // Keep current order but mark that we'll clear seeds in DB
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const seeds = order.map((entry, i) => ({ entryId: entry.id, seed: i + 1 }));
    const result = await bulkUpdateSeedsAction(categoryId, seeds, tournamentId);
    if (result.error) {
      setError(result.error);
    } else {
      setSaved(true);
      router.refresh();
    }
    setSaving(false);
  }

  async function handleClearAndSave() {
    setSaving(true);
    setError(null);
    const seeds = order.map((entry) => ({ entryId: entry.id, seed: null }));
    const result = await bulkUpdateSeedsAction(categoryId, seeds, tournamentId);
    if (result.error) {
      setError(result.error);
    } else {
      setSaved(false);
      router.refresh();
    }
    setSaving(false);
  }

  if (entries.length < 2) return null;

  return (
    <section className="mb-8">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">
            Seeding
          </h2>
          <p className="mt-0.5 text-xs text-slate-600">
            Order determines bracket positions — seed 1 is top of the draw.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleAutoSeed}
            disabled={saving}
            className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-300 hover:border-brand-500 hover:text-brand-400 transition-colors disabled:opacity-50"
          >
            Auto-seed by rating
          </button>

          {allSeeded && (
            <button
              onClick={handleClearAndSave}
              disabled={saving}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-500 hover:border-red-700 hover:text-red-400 transition-colors disabled:opacity-50"
            >
              Clear seeds
            </button>
          )}

          <button
            onClick={handleSave}
            disabled={saving || saved}
            className={`rounded-lg px-4 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
              saved
                ? 'bg-accent-500/20 text-accent-400 border border-accent-500/40'
                : 'bg-brand-600 text-white hover:bg-brand-700'
            }`}
          >
            {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save seeding'}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-3 rounded-lg border border-red-800 bg-red-950 px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Seeding list */}
      <div className="overflow-hidden rounded-xl ring-1 ring-surface-border">
        <div className="divide-y divide-surface-border bg-surface-card">
          {order.map((entry, index) => {
            const player = entry.players;
            const rating = player?.global_stats?.current_rating?.toFixed(2) ?? '—';
            const seedNum = index + 1;

            return (
              <div
                key={entry.id}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface/40 transition-colors"
              >
                {/* Seed number */}
                <div className="flex w-8 shrink-0 items-center justify-center">
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded text-xs font-bold ${
                      seedNum <= 4
                        ? 'bg-brand-900/60 text-brand-300 ring-1 ring-brand-700/50'
                        : 'text-slate-500'
                    }`}
                  >
                    {seedNum}
                  </span>
                </div>

                {/* Up/Down arrows */}
                <div className="flex shrink-0 flex-col gap-0.5">
                  <button
                    onClick={() => moveUp(index)}
                    disabled={index === 0 || saving}
                    className="flex h-4 w-5 items-center justify-center rounded text-slate-600 hover:bg-surface-border hover:text-slate-300 disabled:opacity-20 transition-colors"
                    title="Move up"
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => moveDown(index)}
                    disabled={index === order.length - 1 || saving}
                    className="flex h-4 w-5 items-center justify-center rounded text-slate-600 hover:bg-surface-border hover:text-slate-300 disabled:opacity-20 transition-colors"
                    title="Move down"
                  >
                    ▼
                  </button>
                </div>

                {/* Avatar */}
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-900 text-xs font-bold text-brand-300">
                  {player?.full_name[0]?.toUpperCase() ?? '?'}
                </div>

                {/* Player name(s) — both partners shown in the same font/weight
                    for doubles, since neither player is more "primary" than
                    the other. */}
                <div className="flex-1 min-w-0">
                  {player ? (
                    <div className="flex flex-col leading-snug">
                      <Link
                        href={`/p/${player.username}`}
                        className="text-sm font-medium text-white hover:text-brand-300 transition-colors truncate block"
                      >
                        {player.full_name}
                      </Link>
                      {entry.partner ? (
                        <Link
                          href={`/p/${entry.partner.username}`}
                          className="text-sm font-medium text-white hover:text-brand-300 transition-colors truncate block"
                        >
                          {entry.partner.full_name}
                        </Link>
                      ) : (
                        <p className="text-xs text-slate-600">@{player.username}</p>
                      )}
                    </div>
                  ) : (
                    <span className="text-slate-500 italic text-sm">Unknown player</span>
                  )}
                </div>

                {/* Rating */}
                <div className="shrink-0 text-right">
                  <span className="text-sm font-medium text-slate-300 tabular-nums">{rating}</span>
                  <p className="text-xs text-slate-600">rating</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p className="mt-2 text-xs text-slate-700">
        Top 4 seeds are highlighted. Seeds are applied when you click <span className="text-slate-500">Save seeding</span>.
      </p>
    </section>
  );
}
