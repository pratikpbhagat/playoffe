'use client';

import { useState, useMemo } from 'react';
import { SuspendClubButton } from './SuspendClubButton';
import { ClubManagersPanel } from './ClubManagersPanel';

type Club = {
  id: string;
  name: string;
  slug: string;
  subscription_tier: string;
  is_suspended: boolean | null;
  created_at: string;
  activeTournaments: number;
  maxActiveTournaments: number | null;
};

const TIER_STYLE: Record<string, string> = {
  free:       'bg-slate-700/40 text-slate-300',
  starter:    'bg-blue-500/20 text-blue-300',
  pro:        'bg-violet-500/20 text-violet-300',
  enterprise: 'bg-amber-500/20 text-amber-300',
};

const TIERS = ['all', 'free', 'starter', 'pro', 'enterprise'] as const;
type TierFilter = typeof TIERS[number];
type StatusFilter = 'all' | 'active' | 'suspended';

interface Props {
  clubs: Club[];
}

export function ClubsListClient({ clubs }: Props) {
  const [search, setSearch]         = useState('');
  const [tier, setTier]             = useState<TierFilter>('all');
  const [status, setStatus]         = useState<StatusFilter>('all');

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return clubs.filter((c) => {
      if (q && !c.name.toLowerCase().includes(q) && !c.slug.toLowerCase().includes(q)) return false;
      if (tier !== 'all' && c.subscription_tier !== tier) return false;
      if (status === 'active'    &&  c.is_suspended) return false;
      if (status === 'suspended' && !c.is_suspended) return false;
      return true;
    });
  }, [clubs, search, tier, status]);

  const hasFilters = search || tier !== 'all' || status !== 'all';

  return (
    <div>
      {/* Filter bar */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-48">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or slug…"
            className="w-full rounded-lg border border-surface-border bg-surface pl-8 pr-3 py-2 text-sm text-white outline-none placeholder:text-slate-600 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        {/* Tier filter */}
        <select
          value={tier}
          onChange={(e) => setTier(e.target.value as TierFilter)}
          className="rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-white outline-none focus:border-brand-500"
        >
          <option value="all">All tiers</option>
          <option value="free">Free</option>
          <option value="starter">Starter</option>
          <option value="pro">Pro</option>
          <option value="enterprise">Enterprise</option>
        </select>

        {/* Status filter */}
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusFilter)}
          className="rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-white outline-none focus:border-brand-500"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </select>

        {/* Result count + clear */}
        <p className="text-xs text-slate-500 whitespace-nowrap">
          {filtered.length} of {clubs.length}
        </p>
        {hasFilters && (
          <button
            onClick={() => { setSearch(''); setTier('all'); setStatus('all'); }}
            className="text-xs text-brand-400 hover:text-brand-300 transition-colors whitespace-nowrap"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* List */}
      <div className="space-y-3">
        {filtered.map((club) => (
          <div
            key={club.id}
            className={`rounded-xl ring-1 transition-all ${
              club.is_suspended
                ? 'bg-red-950/20 ring-red-900/50'
                : 'bg-surface-card ring-surface-border'
            }`}
          >
            <div className="flex items-center justify-between px-5 py-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-white">{club.name}</p>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${TIER_STYLE[club.subscription_tier] ?? TIER_STYLE.free}`}>
                    {club.subscription_tier}
                  </span>
                  {club.is_suspended && (
                    <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-semibold text-red-400 uppercase tracking-wide">
                      Suspended
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  {club.slug} · Created {new Date(club.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                  {' · '}
                  {club.activeTournaments}
                  {club.maxActiveTournaments !== null ? ` / ${club.maxActiveTournaments}` : ''} active tournament
                  {club.activeTournaments === 1 && club.maxActiveTournaments === 1 ? '' : 's'}
                  {club.maxActiveTournaments !== null && club.activeTournaments >= club.maxActiveTournaments && (
                    <span className="ml-1 text-amber-400">(at limit)</span>
                  )}
                </p>
              </div>

              <div className="flex items-center gap-3 shrink-0 ml-4">
                <SuspendClubButton
                  clubId={club.id}
                  clubName={club.name}
                  isSuspended={club.is_suspended ?? false}
                />
              </div>
            </div>

            <ClubManagersPanel clubId={club.id} clubName={club.name} />
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="rounded-xl bg-surface-card p-10 text-center ring-1 ring-surface-border">
            <p className="text-sm text-slate-500">
              {hasFilters
                ? 'No clubs match your filters.'
                : 'No clubs yet. Use "+ New Club" above to create the first one.'}
            </p>
            {hasFilters && (
              <button
                onClick={() => { setSearch(''); setTier('all'); setStatus('all'); }}
                className="mt-3 text-xs text-brand-400 hover:text-brand-300 transition-colors"
              >
                Clear filters
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
