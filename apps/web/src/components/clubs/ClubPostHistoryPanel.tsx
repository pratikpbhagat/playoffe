'use client';

import type { PostLogRow } from '@/lib/actions/social';
import { formatDistanceToNow } from 'date-fns';

const TRIGGER_LABELS: Record<string, string> = {
  podium:             '🏆 Category winner',
  wrap_up:            '🎾 Tournament wrap-up',
  draw_published:     '🎯 Draw published',
  schedule_released:  '📅 Schedule released',
};

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  posted:    { label: 'Posted',    className: 'text-accent-400 bg-accent-500/10' },
  posting:   { label: 'Posting…',  className: 'text-brand-300 bg-brand-900/30 animate-pulse' },
  failed:    { label: 'Failed',    className: 'text-red-400 bg-red-900/20' },
  skipped:   { label: 'Skipped',   className: 'text-slate-500 bg-slate-800/40' },
  queued:    { label: 'Queued',    className: 'text-slate-400 bg-slate-800/40' },
};

const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  facebook:  'Facebook',
  x:         'X',
};

interface Props {
  history: PostLogRow[];
}

export function ClubPostHistoryPanel({ history }: Props) {
  if (history.length === 0) {
    return (
      <div className="mt-6">
        <h3 className="mb-3 text-sm font-semibold text-slate-400 uppercase tracking-wide">Post history</h3>
        <p className="text-xs text-slate-600">
          No posts yet. Once draws or schedules are shared and categories complete,
          they&apos;ll appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <h3 className="mb-3 text-sm font-semibold text-slate-400 uppercase tracking-wide">Post history</h3>
      <div className="overflow-hidden rounded-lg ring-1 ring-surface-border">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-surface-border bg-surface/40">
              <th className="px-4 py-2.5 text-left font-medium text-slate-500">Platform</th>
              <th className="px-4 py-2.5 text-left font-medium text-slate-500 hidden sm:table-cell">Type</th>
              <th className="px-4 py-2.5 text-left font-medium text-slate-500">Status</th>
              <th className="px-4 py-2.5 text-right font-medium text-slate-500">When</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {history.map((row) => {
              const statusStyle = STATUS_STYLES[row.status] ?? { label: row.status, className: 'text-slate-400' };
              const displayTime = row.posted_at ?? row.queued_at;
              const timeAgo     = formatDistanceToNow(new Date(displayTime), { addSuffix: true });

              return (
                <tr key={row.id} className="hover:bg-surface/20 transition-colors">
                  <td className="px-4 py-2.5 font-medium text-white">
                    {PLATFORM_LABELS[row.platform] ?? row.platform}
                  </td>
                  <td className="px-4 py-2.5 text-slate-400 hidden sm:table-cell">
                    {TRIGGER_LABELS[row.trigger_type] ?? row.trigger_type}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusStyle.className}`}>
                      {statusStyle.label}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-500">{timeAgo}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
