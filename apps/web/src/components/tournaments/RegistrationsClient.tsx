'use client';

import { useState, useMemo } from 'react';
import { PendingEntriesPanel } from './PendingEntriesPanel';
import { AddPlayerByEmail } from './AddPlayerByEmail';
import { ImportPlayersPanel } from './ImportPlayersPanel';

interface EntryRow {
  id: string;
  status: string;
  registered_at: string;
  category_id: string;
  seed: number | null;
  players: {
    id: string;
    full_name: string;
    username: string;
    global_stats: { current_rating: number } | null;
  } | null;
  partner?: { full_name: string; username: string } | null;
}

interface Category {
  id: string;
  name: string;
  slug: string;
  play_format: string;
  max_entries: number | null;
  status: string;
}

interface Props {
  tournamentSlug: string;
  tournamentId: string;
  categories: Category[];
  allEntries: EntryRow[];
}

const STATUS_OPTS = [
  { value: '', label: 'All statuses' },
  { value: 'active',      label: 'Active' },
  { value: 'pending',     label: 'Pending approval' },
  { value: 'waitlisted',  label: 'Waitlisted' },
  { value: 'provisional', label: 'Invite sent' },
  { value: 'withdrawn',   label: 'Withdrawn / Removed' },
];

export function RegistrationsClient({ tournamentSlug, tournamentId, categories, allEntries }: Props) {
  const [activeCatId, setActiveCatId] = useState(categories[0]?.id ?? '');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const activeCategory = categories.find((c) => c.id === activeCatId);

  // Count pending per category for the dropdown badge
  const pendingByCat = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of allEntries) {
      if (e.status === 'pending') counts[e.category_id] = (counts[e.category_id] ?? 0) + 1;
    }
    return counts;
  }, [allEntries]);

  // Filter entries for the active category
  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allEntries.filter((e) => {
      if (e.category_id !== activeCatId) return false;
      if (statusFilter && e.status !== statusFilter) return false;
      if (q) {
        const playerName = e.players?.full_name?.toLowerCase() ?? '';
        const partnerName = e.partner?.full_name?.toLowerCase() ?? '';
        const username = e.players?.username?.toLowerCase() ?? '';
        const partnerUsername = e.partner?.username?.toLowerCase() ?? '';
        if (
          !playerName.includes(q) &&
          !partnerName.includes(q) &&
          !username.includes(q) &&
          !partnerUsername.includes(q)
        ) return false;
      }
      return true;
    });
  }, [allEntries, activeCatId, search, statusFilter]);

  if (categories.length === 0) {
    return (
      <div className="rounded-xl bg-surface-card p-10 text-center ring-1 ring-surface-border">
        <p className="text-sm text-slate-500">No categories have been added to this tournament.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Controls ────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3">
        {/* Category dropdown */}
        <div className="relative min-w-[220px] flex-1">
          <select
            value={activeCatId}
            onChange={(e) => { setActiveCatId(e.target.value); setSearch(''); setStatusFilter(''); }}
            className="w-full appearance-none rounded-lg border border-slate-600 bg-surface-card px-4 py-2 pr-9 text-sm text-white outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 cursor-pointer"
          >
            {categories.map((cat) => {
              const pending = pendingByCat[cat.id] ?? 0;
              return (
                <option key={cat.id} value={cat.id}>
                  {cat.name}{pending > 0 ? ` (${pending} pending)` : ''}
                </option>
              );
            })}
          </select>
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">▾</span>
        </div>

        {/* Status filter */}
        <div className="relative">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="appearance-none rounded-lg border border-slate-600 bg-surface-card px-4 py-2 pr-9 text-sm text-white outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 cursor-pointer"
          >
            {STATUS_OPTS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">▾</span>
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-[180px]">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search player name…"
            className="w-full rounded-lg border border-slate-600 bg-surface-card px-4 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* ── Entries panel ───────────────────────────────────────────────────── */}
      {activeCategory && (
        <PendingEntriesPanel
          tournamentSlug={tournamentSlug}
          tournamentId={tournamentId}
          category={activeCategory}
          entries={filteredEntries}
          isFiltered={!!(search || statusFilter)}
        />
      )}

      {/* ── Add player / pair ────────────────────────────────────────────────── */}
      {activeCategory && (
        <AddPlayerByEmail
          tournamentId={tournamentId}
          categoryId={activeCategory.id}
          playFormat={activeCategory.play_format as 'singles' | 'doubles' | 'mixed_doubles'}
        />
      )}

      {/* ── CSV import ───────────────────────────────────────────────────────── */}
      {activeCategory && (
        <ImportPlayersPanel
          tournamentId={tournamentId}
          categoryId={activeCategory.id}
        />
      )}
    </div>
  );
}
