'use client';

import { useState, useTransition } from 'react';
import { saveNotificationPrefsAction } from '@/lib/actions/notifications';
import type { NotificationPrefs } from '@/lib/actions/notifications';
import { useToast } from '@/components/ui/ToastProvider';

const PREF_LABELS: { key: keyof NotificationPrefs; label: string; description: string }[] = [
  {
    key: 'match_reminders',
    label: 'Match reminders',
    description: 'Get notified when your next scheduled match is approaching.',
  },
  {
    key: 'score_results',
    label: 'Score results',
    description: 'Notifications when a match result is recorded for you.',
  },
  {
    key: 'tournament_updates',
    label: 'Tournament updates',
    description: 'Announcements and status changes from tournaments you\'re entered in.',
  },
  {
    key: 'partner_requests',
    label: 'Partner requests',
    description: 'When another player invites you as their doubles partner.',
  },
  {
    key: 'new_followers',
    label: 'New followers',
    description: 'When someone follows your player profile.',
  },
];

export function NotificationPrefsForm({ initialPrefs }: { initialPrefs: NotificationPrefs }) {
  const [prefs, setPrefs] = useState<NotificationPrefs>(initialPrefs);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  function toggle(key: keyof NotificationPrefs) {
    setPrefs((p) => ({ ...p, [key]: !p[key] }));
  }

  function handleSave() {
    startTransition(async () => {
      const result = await saveNotificationPrefsAction(prefs);
      if ('error' in result && result.error) {
        toast(result.error as string, 'error');
      } else {
        toast('Notification preferences saved', 'success');
      }
    });
  }

  return (
    <div className="rounded-xl bg-surface-card ring-1 ring-surface-border overflow-hidden">
      <div className="divide-y divide-surface-border">
        {PREF_LABELS.map(({ key, label, description }) => (
          <div key={key} className="flex items-center justify-between px-6 py-4 gap-4">
            <div>
              <p className="text-sm font-medium text-white">{label}</p>
              <p className="text-xs text-slate-500 mt-0.5">{description}</p>
            </div>
            <button
              onClick={() => toggle(key)}
              aria-pressed={prefs[key]}
              className={`relative shrink-0 inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                prefs[key] ? 'bg-brand-600' : 'bg-slate-700'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                  prefs[key] ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 px-6 py-4 border-t border-surface-border bg-surface/30">
        <button
          onClick={handleSave}
          disabled={isPending}
          className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
        >
          {isPending ? 'Saving…' : 'Save preferences'}
        </button>
      </div>
    </div>
  );
}
