'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { registerForCategoryAction, withdrawEntryAction } from '@/lib/actions/registration';

interface Category {
  id: string;
  name: string;
  play_format: string;
  draw_format: string;
  status: string;
  max_entries: number | null;
}

interface Props {
  tournamentId: string;
  category: Category;
  entryCount: number;
  myStatus: string | null;    // player's own entry status, or null
  registrationOpen: boolean;
  isLoggedIn: boolean;
  playFormatLabel: string;
  drawFormatLabel: string;
}

const MY_STATUS_BADGE: Record<string, { label: string; className: string }> = {
  active:     { label: 'Registered ✓',     className: 'bg-accent-500/20 text-accent-400' },
  pending:    { label: 'Pending approval',  className: 'bg-amber-900/40 text-amber-300' },
  waitlisted: { label: 'Waitlisted',        className: 'bg-slate-700/60 text-slate-300' },
};

const CAT_STATUS: Record<string, string> = {
  pending:        'Setup',
  registration:   'Open',
  draw_generated: 'Draw ready',
  in_progress:    'In progress',
  completed:      'Completed',
};

export function PublicCategoryCard({
  tournamentId,
  category,
  entryCount,
  myStatus,
  registrationOpen,
  isLoggedIn,
  playFormatLabel,
  drawFormatLabel,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localStatus, setLocalStatus] = useState(myStatus);

  const isFull = category.max_entries !== null && entryCount >= category.max_entries;
  const categoryAcceptsEntries = category.status === 'registration';
  const canRegister = registrationOpen && categoryAcceptsEntries && !localStatus && !isFull;
  const canWaitlist = registrationOpen && categoryAcceptsEntries && !localStatus && isFull;
  const canWithdraw = !!localStatus && localStatus !== 'withdrawn';

  async function handleRegister() {
    setLoading(true);
    setError(null);
    const result = await registerForCategoryAction(category.id);
    if (result.error) {
      setError(result.error);
    } else {
      setLocalStatus(result.status ?? 'active');
      router.refresh();
    }
    setLoading(false);
  }

  async function handleWithdraw() {
    if (!confirm('Withdraw from this category? You can re-register if spots are still available.')) return;
    setLoading(true);
    setError(null);

    // We need the entry ID — can't get it from props, so we rely on server redirect
    // Simpler: use the registration action which knows the user's entry
    // For now, reload to let the server page handle it with the entryId
    // Actually we'll redirect to the withdraw page
    router.push(`/events/${tournamentId}/withdraw/${category.id}`);
  }

  const myBadge = localStatus ? MY_STATUS_BADGE[localStatus] : null;

  return (
    <div className="rounded-xl bg-surface-card px-6 py-5 ring-1 ring-surface-border">
      <div className="flex items-start justify-between gap-4">
        {/* Left: info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h3 className="text-sm font-semibold text-white">{category.name}</h3>
            {myBadge && (
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${myBadge.className}`}>
                {myBadge.label}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {playFormatLabel} · {drawFormatLabel}
          </p>

          {/* Entry count */}
          <div className="mt-2 flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <div
                className="h-1.5 rounded-full bg-brand-600"
                style={{
                  width: category.max_entries
                    ? `${Math.min(100, (entryCount / category.max_entries) * 100)}%`
                    : '0%',
                  minWidth: entryCount > 0 ? '4px' : '0',
                  maxWidth: '80px',
                }}
              />
              <span className="text-xs text-slate-400">
                {entryCount}
                {category.max_entries ? ` / ${category.max_entries}` : ' entries'}
              </span>
              {isFull && (
                <span className="rounded-full bg-slate-700/60 px-2 py-0.5 text-[10px] text-slate-400">
                  Full
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right: action */}
        <div className="shrink-0 flex flex-col items-end gap-2">
          {/* Category draw status badge */}
          {category.status !== 'registration' && category.status !== 'pending' && (
            <span className="text-xs text-slate-500">{CAT_STATUS[category.status] ?? category.status}</span>
          )}

          {/* Register */}
          {isLoggedIn && canRegister && (
            <button
              onClick={handleRegister}
              disabled={loading}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'Registering…' : 'Register'}
            </button>
          )}

          {/* Join waitlist */}
          {isLoggedIn && canWaitlist && (
            <button
              onClick={handleRegister}
              disabled={loading}
              className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-surface-border hover:text-white transition-colors disabled:opacity-50"
            >
              {loading ? 'Joining…' : 'Join waitlist'}
            </button>
          )}

          {/* Log in prompt */}
          {!isLoggedIn && (registrationOpen && categoryAcceptsEntries) && (
            <Link
              href={`/login?return=${encodeURIComponent(`/events/${tournamentId}`)}`}
              className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-surface-card hover:text-white transition-colors"
            >
              Log in to register
            </Link>
          )}

          {/* Withdraw */}
          {canWithdraw && (
            <button
              onClick={handleWithdraw}
              disabled={loading}
              className="text-xs text-slate-500 hover:text-red-400 transition-colors"
            >
              Withdraw
            </button>
          )}

          {/* View draw */}
          {(category.status === 'draw_generated' || category.status === 'in_progress' || category.status === 'completed') && (
            <Link
              href={`/events/${tournamentId}/draw/${category.id}`}
              className="text-xs text-brand-400 hover:text-brand-300 transition-colors"
            >
              View draw →
            </Link>
          )}
        </div>
      </div>

      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
    </div>
  );
}
