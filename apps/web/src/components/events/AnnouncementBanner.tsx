'use client';

import { useState, useEffect } from 'react';
import type { Announcement } from '@/lib/actions/announcements';

interface Props {
  announcements: Announcement[];
}

const URGENCY_STYLE = {
  normal: {
    container: 'bg-blue-950/60 ring-blue-700/40',
    icon: '📢',
    label: 'text-blue-300',
    text: 'text-blue-100',
    dismiss: 'text-blue-500 hover:text-blue-300',
  },
  urgent: {
    container: 'bg-amber-950/60 ring-amber-600/40',
    icon: '🚨',
    label: 'text-amber-300',
    text: 'text-amber-100',
    dismiss: 'text-amber-600 hover:text-amber-400',
  },
};

const STORAGE_KEY = 'playoffe_dismissed_announcements';

function getDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function saveDismissed(ids: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // ignore
  }
}

export function AnnouncementBanner({ announcements }: Props) {
  const [visible, setVisible] = useState<Announcement[]>([]);

  useEffect(() => {
    const dismissed = getDismissed();
    setVisible(announcements.filter((a) => !dismissed.has(a.id)));
  }, [announcements]);

  function dismiss(id: string) {
    const dismissed = getDismissed();
    dismissed.add(id);
    saveDismissed(dismissed);
    setVisible((prev) => prev.filter((a) => a.id !== id));
  }

  if (visible.length === 0) return null;

  return (
    <div className="mb-6 space-y-2">
      {visible.map((a) => {
        const style = URGENCY_STYLE[a.urgency] ?? URGENCY_STYLE.normal;
        const sentDate = new Date(a.sent_at).toLocaleString('en-AU', {
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        });

        return (
          <div
            key={a.id}
            className={`flex items-start gap-3 rounded-xl px-5 py-4 ring-1 ${style.container}`}
          >
            <span className="shrink-0 text-lg leading-tight">{style.icon}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2 mb-0.5">
                <span className={`text-xs font-semibold uppercase tracking-wide ${style.label}`}>
                  {a.urgency === 'urgent' ? 'Urgent' : 'Notice'}
                </span>
                <span className="text-xs text-slate-500">{sentDate}</span>
              </div>
              <p className={`text-sm leading-relaxed ${style.text}`}>{a.message}</p>
            </div>
            <button
              onClick={() => dismiss(a.id)}
              aria-label="Dismiss announcement"
              className={`shrink-0 text-xl leading-none transition-colors ${style.dismiss}`}
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
