'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import Link from 'next/link';
import {
  approveEntryAction,
  rejectEntryAction,
  promoteWaitlistedEntryAction,
  bulkApproveEntriesAction,
  removeEntryAction,
  updateEntrySeedAction,
} from '@/lib/actions/registration';
import { withdrawAndWalkoverAction } from '@/lib/actions/scoring';

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
  // Partner (for doubles entries)
  partner?: {
    full_name: string;
    username: string;
  } | null;
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
  category: Category;
  entries: EntryRow[];
  /** When true, the empty-state message acknowledges active filters */
  isFiltered?: boolean;
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  active:      { label: 'Active',           className: 'text-accent-400 bg-accent-500/10' },
  pending:     { label: 'Pending',          className: 'text-amber-300 bg-amber-900/30' },
  waitlisted:  { label: 'Waitlisted',       className: 'text-slate-300 bg-slate-700/50' },
  provisional: { label: 'Invite sent',      className: 'text-brand-300 bg-brand-900/40' },
  withdrawn:   { label: 'Withdrawn',        className: 'text-slate-500 bg-slate-800/60 line-through' },
};

const PLAY_FORMAT: Record<string, string> = {
  singles:       'Singles',
  doubles:       'Doubles',
  mixed_doubles: 'Mixed doubles',
};

export function PendingEntriesPanel({ tournamentSlug, tournamentId, category, entries, isFiltered }: Props) {
  const router = useRouter();
  const { confirm } = useConfirm();
  const [acting, setActing] = useState<string | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [editingSeed, setEditingSeed] = useState<string | null>(null);
  const [seedValue, setSeedValue] = useState<string>('');
  const [showDrawAlert, setShowDrawAlert] = useState(false);

  const drawIsActive =
    category.status === 'draw_generated' || category.status === 'in_progress';

  const pending     = entries.filter((e) => e.status === 'pending');
  const active      = entries.filter((e) => e.status === 'active');
  const waitlisted  = entries.filter((e) => e.status === 'waitlisted');
  const provisional = entries.filter((e) => e.status === 'provisional');
  const withdrawn   = entries.filter((e) => e.status === 'withdrawn');

  async function handleApprove(entryId: string) {
    setActing(entryId);
    const result = await approveEntryAction(entryId);
    if (result.error) setMsg(`Error: ${result.error}`);
    else router.refresh();
    setActing(null);
  }

  async function handleReject(entryId: string) {
    if (!await confirm({ title: 'Reject registration', message: 'Remove this registration? The player will need to re-register.', confirmLabel: 'Reject', variant: 'danger' })) return;
    setActing(entryId);
    const result = await rejectEntryAction(entryId);
    if (result.error) setMsg(`Error: ${result.error}`);
    else router.refresh();
    setActing(null);
  }

  async function handleRemove(entryId: string, playerName: string) {
    if (!await confirm({ title: 'Remove entry', message: `Remove ${playerName} from this category? The next waitlisted player will be promoted.`, confirmLabel: 'Remove', variant: 'danger' })) return;
    setActing(entryId);
    const result = await removeEntryAction(entryId);
    if (result.error) setMsg(`Error: ${result.error}`);
    else {
      if (drawIsActive) setShowDrawAlert(true);
      router.refresh();
    }
    setActing(null);
  }

  async function handleWithdraw(entryId: string, playerName: string) {
    if (!await confirm({ title: `Withdraw ${playerName}?`, message: 'Their remaining scheduled matches will be awarded as walkovers to opponents. This cannot be undone.', confirmLabel: 'Withdraw', variant: 'danger' })) return;
    setActing(entryId);
    const result = await withdrawAndWalkoverAction(entryId, tournamentId);
    if ('error' in result && result.error) setMsg(`Error: ${result.error}`);
    else {
      const w = 'walkovers' in result ? result.walkovers : 0;
      setMsg(`Withdrawn. ${w} walkover${w !== 1 ? 's' : ''} awarded.`);
      if (drawIsActive) setShowDrawAlert(true);
      router.refresh();
    }
    setActing(null);
  }

  async function handlePromote(entryId: string, playerName: string) {
    if (!await confirm({ title: 'Promote from waitlist', message: `Move ${playerName} to active status?`, confirmLabel: 'Promote' })) return;
    setActing(entryId);
    const result = await promoteWaitlistedEntryAction(entryId);
    if (result.error) setMsg(`Error: ${result.error}`);
    else router.refresh();
    setActing(null);
  }

  async function handleBulkApprove() {
    if (!await confirm({ title: 'Approve all entries', message: `Approve all ${pending.length} pending registrations for ${category.name}?`, confirmLabel: 'Approve all' })) return;
    setBulkLoading(true);
    const result = await bulkApproveEntriesAction(category.id);
    if (result.error) {
      setMsg(`Error: ${result.error}`);
    } else {
      setMsg(`Approved ${result.approved ?? 0}${result.waitlisted ? `, waitlisted ${result.waitlisted}` : ''}`);
      router.refresh();
    }
    setBulkLoading(false);
  }

  function startSeedEdit(entryId: string, currentSeed: number | null) {
    setEditingSeed(entryId);
    setSeedValue(currentSeed?.toString() ?? '');
  }

  async function saveSeed(entryId: string) {
    const seed = seedValue.trim() === '' ? null : parseInt(seedValue, 10);
    if (seedValue.trim() !== '' && (isNaN(seed!) || seed! < 1)) {
      setMsg('Seed must be a positive number.');
      return;
    }
    setActing(entryId);
    const result = await updateEntrySeedAction(entryId, seed);
    if (result.error) setMsg(`Error: ${result.error}`);
    else router.refresh();
    setEditingSeed(null);
    setActing(null);
  }

  const totalCount = entries.length;
  const activeCount = active.length;
  const capacityStr = category.max_entries
    ? `${activeCount} / ${category.max_entries}`
    : `${activeCount} active`;

  // Order: pending → provisional → waitlisted → active → withdrawn (last)
  const orderedEntries = [...pending, ...provisional, ...waitlisted, ...active, ...withdrawn];

  return (
    <div className="rounded-xl bg-surface-card ring-1 ring-surface-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-surface-border px-5 py-4 flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-white">{category.name}</h3>
            <span className="text-xs text-slate-500">{PLAY_FORMAT[category.play_format] ?? category.play_format}</span>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            {capacityStr} entries
            {waitlisted.length > 0 && ` · ${waitlisted.length} waitlisted`}
            {provisional.length > 0 && ` · ${provisional.length} invite pending`}
            {pending.length > 0 && (
              <> · <span className="text-amber-300">{pending.length} pending approval</span></>
            )}
            {withdrawn.length > 0 && ` · ${withdrawn.length} withdrawn`}
          </p>
        </div>

        {pending.length > 1 && (
          <button
            onClick={handleBulkApprove}
            disabled={bulkLoading}
            className="rounded-lg bg-accent-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-700 transition-colors disabled:opacity-50"
          >
            {bulkLoading ? 'Approving…' : `Approve all (${pending.length})`}
          </button>
        )}
      </div>

      {msg && (
        <div className="border-b border-surface-border bg-surface px-5 py-2 text-xs text-slate-300">
          {msg}{' '}
          <button onClick={() => setMsg(null)} className="text-slate-500 hover:text-slate-300 ml-2">✕</button>
        </div>
      )}

      {showDrawAlert && (
        <div className="border-b border-amber-800/40 bg-amber-950/30 px-5 py-3 text-xs">
          <div className="flex items-start justify-between gap-3">
            <p className="text-amber-200">
              ⚠️ The draw for <strong>{category.name}</strong> is now out of sync.{' '}
              <Link
                href={`/tournaments/${tournamentSlug}/categories/${category.slug}`}
                className="underline hover:text-amber-100 transition-colors"
              >
                Go to category page
              </Link>{' '}
              to replace or regenerate the draw.
            </p>
            <button
              onClick={() => setShowDrawAlert(false)}
              className="text-amber-600 hover:text-amber-400 transition-colors shrink-0"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {totalCount === 0 ? (
        <div className="px-5 py-8 text-center">
          <p className="text-sm text-slate-500">
            {isFiltered ? 'No entries match the current filters.' : 'No entries yet.'}
          </p>
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-border bg-surface/40">
              <th className="px-5 py-2.5 text-left text-xs font-medium text-slate-500">Player</th>
              <th className="px-3 py-2.5 text-center text-xs font-medium text-slate-500 w-12">Seed</th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-500 hidden sm:table-cell">Rating</th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-500 hidden md:table-cell">Registered</th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-500">Status</th>
              <th className="px-5 py-2.5 text-right text-xs font-medium text-slate-500 hidden sm:table-cell">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {orderedEntries.map((entry) => {
              const player = entry.players;
              const badge = STATUS_BADGE[entry.status] ?? { label: entry.status, className: 'text-slate-500' };
              const isPending = entry.status === 'pending';
              const isProvisional = entry.status === 'provisional';
              const isActive = entry.status === 'active';
              const isWaitlisted = entry.status === 'waitlisted';
              const isWithdrawn = entry.status === 'withdrawn';
              const isEditingSeed = editingSeed === entry.id;
              const registeredDate = new Date(entry.registered_at).toLocaleDateString('en-AU', {
                day: 'numeric', month: 'short',
              });

              return (
                <tr
                  key={entry.id}
                  className={`transition-colors ${
                    isWithdrawn
                      ? 'opacity-50'
                      : isPending
                      ? 'bg-amber-900/5'
                      : isProvisional
                      ? 'bg-brand-900/5'
                      : 'hover:bg-surface/30'
                  }`}
                >
                  {/* Player — for doubles show both names at identical style */}
                  <td className="px-5 py-3">
                    {player ? (
                      <div>
                        {entry.partner ? (
                          /* ── Doubles pair ── */
                          <>
                            <Link
                              href={`/p/${player.username}`}
                              className="block text-sm font-medium text-white hover:text-brand-300 transition-colors"
                            >
                              {player.full_name}
                            </Link>
                            <Link
                              href={`/p/${entry.partner.username}`}
                              className="block text-sm font-medium text-white hover:text-brand-300 transition-colors"
                            >
                              {entry.partner.full_name}
                            </Link>
                            <p className="mt-0.5 text-xs text-slate-500">
                              @{player.username} · @{entry.partner.username}
                              {isProvisional && <span className="ml-1 text-brand-400">⏳ awaiting confirm</span>}
                            </p>
                          </>
                        ) : (
                          /* ── Singles ── */
                          <>
                            <Link
                              href={`/p/${player.username}`}
                              className="text-sm font-medium text-white hover:text-brand-300 transition-colors"
                            >
                              {player.full_name}
                            </Link>
                            <p className="text-xs text-slate-500">@{player.username}</p>
                          </>
                        )}

                        {/* Mobile-only inline actions (hidden on desktop where the Actions column is used) */}
                        <div className="mt-2 flex flex-wrap items-center gap-2 sm:hidden">
                          {isPending && (
                            <>
                              <button
                                onClick={() => handleApprove(entry.id)}
                                disabled={acting === entry.id}
                                className="rounded-lg bg-accent-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-accent-700 transition-colors disabled:opacity-50"
                              >
                                {acting === entry.id ? '…' : 'Approve'}
                              </button>
                              <button
                                onClick={() => handleReject(entry.id)}
                                disabled={acting === entry.id}
                                className="rounded-lg border border-slate-600 px-2.5 py-1 text-xs text-slate-400 hover:border-red-600 hover:text-red-400 transition-colors disabled:opacity-50"
                              >
                                Reject
                              </button>
                            </>
                          )}
                          {isWaitlisted && (
                            <button
                              onClick={() => handlePromote(entry.id, player?.full_name ?? 'player')}
                              disabled={acting === entry.id}
                              className="rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
                            >
                              {acting === entry.id ? '…' : 'Promote'}
                            </button>
                          )}
                          {isActive && (
                            <button
                              onClick={() => handleWithdraw(entry.id, player?.full_name ?? 'player')}
                              disabled={acting === entry.id}
                              className="text-xs font-medium text-brand-400 hover:text-brand-300 transition-colors disabled:opacity-50"
                            >
                              {acting === entry.id ? '…' : 'Withdraw'}
                            </button>
                          )}
                          {(isActive || isWaitlisted) && (
                            <button
                              onClick={() => handleRemove(entry.id, player?.full_name ?? 'player')}
                              disabled={acting === entry.id}
                              className="text-xs font-medium text-brand-400 hover:text-brand-300 transition-colors disabled:opacity-50"
                            >
                              {acting === entry.id ? '…' : 'Remove'}
                            </button>
                          )}
                          {isProvisional && (
                            <button
                              onClick={() => handleRemove(entry.id, player?.full_name ?? 'player')}
                              disabled={acting === entry.id}
                              className="text-xs font-medium text-brand-400 hover:text-brand-300 transition-colors disabled:opacity-50"
                            >
                              {acting === entry.id ? '…' : 'Cancel invite'}
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <span className="italic text-slate-500">Unknown</span>
                    )}
                  </td>

                  {/* Seed */}
                  <td className="px-3 py-3 text-center">
                    {isEditingSeed ? (
                      <div className="flex items-center gap-1 justify-center">
                        <input
                          type="number"
                          min={1}
                          value={seedValue}
                          onChange={(e) => setSeedValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveSeed(entry.id);
                            if (e.key === 'Escape') setEditingSeed(null);
                          }}
                          className="w-12 rounded border border-slate-600 bg-surface px-1 py-0.5 text-center text-xs text-white focus:border-brand-500 focus:outline-none"
                          autoFocus
                        />
                        <button
                          onClick={() => saveSeed(entry.id)}
                          disabled={acting === entry.id}
                          className="text-accent-400 hover:text-accent-300 text-xs"
                        >
                          ✓
                        </button>
                        <button onClick={() => setEditingSeed(null)} className="text-slate-600 hover:text-slate-400 text-xs">✕</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => startSeedEdit(entry.id, entry.seed)}
                        title="Click to set seed"
                        className="rounded px-1.5 py-0.5 text-xs hover:bg-surface transition-colors"
                      >
                        {entry.seed ? (
                          <span className="font-bold text-brand-300">#{entry.seed}</span>
                        ) : (
                          <span className="text-slate-700">—</span>
                        )}
                      </button>
                    )}
                  </td>

                  {/* Rating */}
                  <td className="px-3 py-3 text-sm text-slate-300 hidden sm:table-cell">
                    {player?.global_stats?.current_rating?.toFixed(2) ?? '—'}
                  </td>

                  {/* Registered date */}
                  <td className="px-3 py-3 text-xs text-slate-500 hidden md:table-cell">
                    {registeredDate}
                  </td>

                  {/* Status */}
                  <td className="px-3 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.className}`}>
                      {badge.label}
                    </span>
                  </td>

                  {/* Actions — hidden on mobile (actions shown inline in Player cell); hidden for withdrawn entries */}
                  <td className="px-5 py-3 text-right hidden sm:table-cell">
                    <div className="flex items-center justify-end gap-2">
                      {isWithdrawn && (
                        <span className="text-xs text-slate-600 italic">—</span>
                      )}
                      {isPending && (
                        <>
                          <button
                            onClick={() => handleApprove(entry.id)}
                            disabled={acting === entry.id}
                            className="rounded-lg bg-accent-600 px-3 py-1 text-xs font-semibold text-white hover:bg-accent-700 transition-colors disabled:opacity-50"
                          >
                            {acting === entry.id ? '…' : 'Approve'}
                          </button>
                          <button
                            onClick={() => handleReject(entry.id)}
                            disabled={acting === entry.id}
                            className="rounded-lg border border-slate-600 px-3 py-1 text-xs text-slate-400 hover:border-red-600 hover:text-red-400 transition-colors disabled:opacity-50"
                          >
                            Reject
                          </button>
                        </>
                      )}
                      {isWaitlisted && (
                        <button
                          onClick={() => handlePromote(entry.id, player?.full_name ?? 'player')}
                          disabled={acting === entry.id}
                          className="rounded-lg bg-brand-600 px-3 py-1 text-xs font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
                        >
                          {acting === entry.id ? '…' : 'Promote'}
                        </button>
                      )}
                      {isActive && (
                        <button
                          onClick={() => handleWithdraw(entry.id, player?.full_name ?? 'player')}
                          disabled={acting === entry.id}
                          className="text-xs font-medium text-brand-400 hover:text-brand-300 transition-colors disabled:opacity-50"
                          title="Withdraw mid-tournament: awards walkovers to opponents"
                        >
                          {acting === entry.id ? '…' : 'Withdraw'}
                        </button>
                      )}
                      {(isActive || isWaitlisted) && (
                        <button
                          onClick={() => handleRemove(entry.id, player?.full_name ?? 'player')}
                          disabled={acting === entry.id}
                          className="text-xs font-medium text-brand-400 hover:text-brand-300 transition-colors disabled:opacity-50"
                          title="Remove entry (pre-tournament)"
                        >
                          {acting === entry.id ? '…' : 'Remove'}
                        </button>
                      )}
                      {isProvisional && (
                        <button
                          onClick={() => handleRemove(entry.id, player?.full_name ?? 'player')}
                          disabled={acting === entry.id}
                          className="text-xs font-medium text-brand-400 hover:text-brand-300 transition-colors disabled:opacity-50"
                          title="Cancel invite"
                        >
                          {acting === entry.id ? '…' : 'Cancel invite'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <div className="border-t border-surface-border px-5 py-3 text-right">
        <Link
          href={`/tournaments/${tournamentSlug}/categories/${category.slug}`}
          className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
        >
          Manage entries →
        </Link>
      </div>
    </div>
  );
}
