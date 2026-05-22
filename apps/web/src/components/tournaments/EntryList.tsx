'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { removeEntryAction, updateSeedAction } from '@/lib/actions/categories';

interface Player {
  id: string;
  full_name: string;
  username: string;
  photo_url: string | null;
  global_stats: { current_rating: number } | null;
}

interface Entry {
  id: string;
  seed: number | null;
  registered_at: string;
  players: Player | null;
}

interface Props {
  entries: Entry[];
  tournamentId: string;
}

export function EntryList({ entries, tournamentId }: Props) {
  const router = useRouter();
  const [removing, setRemoving] = useState<string | null>(null);
  const [seedEditing, setSeedEditing] = useState<string | null>(null);
  const [seedValues, setSeedValues] = useState<Record<string, string>>({});

  async function handleRemove(entryId: string) {
    if (!confirm('Remove this player from the category?')) return;
    setRemoving(entryId);
    await removeEntryAction(entryId, tournamentId);
    router.refresh();
    setRemoving(null);
  }

  async function handleSeedBlur(entryId: string) {
    const raw = seedValues[entryId];
    const seed = raw ? parseInt(raw, 10) : null;
    await updateSeedAction(entryId, isNaN(seed!) ? null : seed, tournamentId);
    setSeedEditing(null);
    router.refresh();
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-xl bg-surface-card p-8 text-center ring-1 ring-surface-border">
        <p className="text-sm text-slate-500">
          No entries yet. Import players via CSV or add by email below.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl ring-1 ring-surface-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-surface-border bg-surface-card">
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Seed</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Player</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-slate-500">Rating</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-slate-500"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-border bg-surface-card">
          {entries.map((entry, index) => {
            const player = entry.players;
            const rating = player?.global_stats?.current_rating?.toFixed(2) ?? '—';
            const isEditingSeed = seedEditing === entry.id;

            return (
              <tr key={entry.id} className="hover:bg-surface/50 transition-colors">
                {/* Seed */}
                <td className="w-16 px-4 py-3">
                  {isEditingSeed ? (
                    <input
                      autoFocus
                      type="number"
                      min={1}
                      max={512}
                      defaultValue={entry.seed ?? ''}
                      onChange={(e) =>
                        setSeedValues((prev) => ({ ...prev, [entry.id]: e.target.value }))
                      }
                      onBlur={() => handleSeedBlur(entry.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur();
                        if (e.key === 'Escape') setSeedEditing(null);
                      }}
                      className="w-12 rounded border border-brand-500 bg-surface px-1.5 py-0.5 text-center text-xs text-white outline-none"
                    />
                  ) : (
                    <button
                      onClick={() => {
                        setSeedEditing(entry.id);
                        setSeedValues((prev) => ({
                          ...prev,
                          [entry.id]: String(entry.seed ?? ''),
                        }));
                      }}
                      className="flex h-6 w-8 items-center justify-center rounded text-xs font-bold transition-colors
                        bg-surface-border text-slate-300 hover:bg-brand-600 hover:text-white"
                      title="Click to set seed"
                    >
                      {entry.seed ?? (index + 1)}
                    </button>
                  )}
                </td>

                {/* Player */}
                <td className="px-4 py-3">
                  {player ? (
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-brand-900 text-xs font-bold text-brand-300">
                        {player.full_name[0]?.toUpperCase()}
                      </div>
                      <div>
                        <Link
                          href={`/p/${player.username}`}
                          className="text-sm font-medium text-white hover:text-brand-300 transition-colors"
                        >
                          {player.full_name}
                        </Link>
                        <p className="text-xs text-slate-500">@{player.username}</p>
                      </div>
                    </div>
                  ) : (
                    <span className="text-slate-500 italic">Unknown player</span>
                  )}
                </td>

                {/* Rating */}
                <td className="px-4 py-3 text-right text-sm font-medium text-slate-300">
                  {rating}
                </td>

                {/* Remove */}
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => handleRemove(entry.id)}
                    disabled={removing === entry.id}
                    className="text-xs text-slate-400 hover:text-red-400 transition-colors disabled:opacity-50"
                    title="Remove from category"
                  >
                    {removing === entry.id ? '…' : '✕'}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
