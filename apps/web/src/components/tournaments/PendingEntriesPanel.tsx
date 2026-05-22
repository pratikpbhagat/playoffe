'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  approveEntryAction,
  rejectEntryAction,
  bulkApproveEntriesAction,
} from '@/lib/actions/registration';

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
}

interface Category {
  id: string;
  name: string;
  slug: string;
  play_format: string;
  max_entries: number | null;
}

interface Props {
  tournamentSlug: string;
  category: Category;
  entries: EntryRow[];
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  active:     { label: 'Active',     className: 'text-accent-400 bg-accent-500/10' },
  pending:    { label: 'Pending',    className: 'text-amber-300 bg-amber-900/30' },
  waitlisted: { label: 'Waitlisted', className: 'text-slate-300 bg-slate-700/50' },
  provisional:{ label: 'Provisional', className: 'text-brand-300 bg-brand-900/40' },
};

const PLAY_FORMAT: Record<string, string> = {
  singles: 'Singles',
  doubles: 'Doubles',
  mixed_doubles: 'Mixed doubles',
};

export function PendingEntriesPanel({ tournamentSlug, category, entries }: Props) {
  const router = useRouter();
  const [acting, setActing] = useState<string | null>(null); // entryId being actioned
  const [bulkLoading, setBulkLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const pending    = entries.filter((e) => e.status === 'pending');
  const active     = entries.filter((e) => e.status === 'active');
  const waitlisted = entries.filter((e) => e.status === 'waitlisted');
  const provisional = entries.filter((e) => e.status === 'provisional');

  async function handleApprove(entryId: string) {
    setActing(entryId);
    const result = await approveEntryAction(entryId);
    if (result.error) setMsg(`Error: ${result.error}`);
    else router.refresh();
    setActing(null);
  }

  async function handleReject(entryId: string) {
    if (!confirm('Reject this registration?')) return;
    setActing(entryId);
    const result = await rejectEntryAction(entryId);
    if (result.error) setMsg(`Error: ${result.error}`);
    else router.refresh();
    setActing(null);
  }

  async function handleBulkApprove() {
    if (!confirm(`Approve all ${pending.length} pending entries for ${category.name}?`)) return;
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

  const totalCount = entries.length;
  const activeCount = active.length;
  const capacityStr = category.max_entries
    ? `${activeCount} / ${category.max_entries}`
    : `${activeCount} active`;

  return (
    <div className="rounded-xl bg-surface-card ring-1 ring-surface-border overflow-hidden">
      {/* Category header */}
      <div className="flex items-center justify-between border-b border-surface-border px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-white">{category.name}</h3>
            <span className="text-xs text-slate-500">{PLAY_FORMAT[category.play_format] ?? category.play_format}</span>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            {capacityStr} entries
            {waitlisted.length > 0 && ` · ${waitlisted.length} waitlisted`}
            {pending.length > 0 && ` · `}
            {pending.length > 0 && (
              <span className="text-amber-300">{pending.length} pending</span>
            )}
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
          {msg}
        </div>
      )}

      {totalCount === 0 ? (
        <div className="px-5 py-8 text-center">
          <p className="text-sm text-slate-500">No entries yet.</p>
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-border bg-surface/40">
              <th className="px-5 py-2.5 text-left text-xs font-medium text-slate-500">Player</th>
              <th className="px-5 py-2.5 text-left text-xs font-medium text-slate-500">Rating</th>
              <th className="px-5 py-2.5 text-left text-xs font-medium text-slate-500">Registered</th>
              <th className="px-5 py-2.5 text-left text-xs font-medium text-slate-500">Status</th>
              <th className="px-5 py-2.5 text-right text-xs font-medium text-slate-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {/* Pending first */}
            {[...pending, ...waitlisted, ...active, ...provisional].map((entry) => {
              const player = entry.players;
              const badge = STATUS_BADGE[entry.status] ?? { label: entry.status, className: 'text-slate-500' };
              const isPending = entry.status === 'pending';
              const registeredDate = new Date(entry.registered_at).toLocaleDateString('en-AU', {
                day: 'numeric', month: 'short',
              });

              return (
                <tr
                  key={entry.id}
                  className={`transition-colors ${isPending ? 'bg-amber-900/5' : 'hover:bg-surface/30'}`}
                >
                  <td className="px-5 py-3">
                    {player ? (
                      <div>
                        <Link
                          href={`/p/${player.username}`}
                          className="text-sm font-medium text-white hover:text-brand-300 transition-colors"
                        >
                          {player.full_name}
                        </Link>
                        <p className="text-xs text-slate-500">@{player.username}</p>
                      </div>
                    ) : (
                      <span className="italic text-slate-500">Unknown</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-sm text-slate-300">
                    {player?.global_stats?.current_rating?.toFixed(2) ?? '—'}
                  </td>
                  <td className="px-5 py-3 text-xs text-slate-500">{registeredDate}</td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.className}`}>
                      {badge.label}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    {isPending && (
                      <div className="flex items-center justify-end gap-2">
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
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* Link back to category */}
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
