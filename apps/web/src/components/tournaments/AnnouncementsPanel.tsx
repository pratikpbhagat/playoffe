'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  sendAnnouncementAction,
  archiveAnnouncementAction,
  type Announcement,
  type AnnouncementUrgency,
} from '@/lib/actions/announcements';
import { useConfirm } from '@/components/ui/ConfirmProvider';

interface Props {
  tournamentId: string;
  tournamentSlug: string;
  announcements: Announcement[];
}

const URGENCY_STYLE: Record<AnnouncementUrgency, { badge: string; row: string }> = {
  normal: {
    badge: 'bg-blue-900/40 text-blue-300',
    row: 'border-l-2 border-blue-600/50',
  },
  urgent: {
    badge: 'bg-amber-900/40 text-amber-300',
    row: 'border-l-2 border-amber-500/70',
  },
};

const MAX_CHARS = 500;

export function AnnouncementsPanel({
  tournamentId,
  tournamentSlug,
  announcements,
}: Props) {
  const router = useRouter();
  const { confirm } = useConfirm();

  const [message, setMessage] = useState('');
  const [urgency, setUrgency] = useState<AnnouncementUrgency>('normal');
  const [pushNotify, setPushNotify] = useState(false);
  const [sending, setSending] = useState(false);
  const [archiving, setArchiving] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  const active = announcements.filter((a) => !a.dismissed_at);
  const archived = announcements.filter((a) => a.dismissed_at);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    setSending(true);
    setMsg(null);
    const result = await sendAnnouncementAction(
      tournamentId,
      tournamentSlug,
      message,
      urgency,
      pushNotify,
    );
    if ('error' in result) {
      setMsg({ type: 'error', text: result.error });
    } else {
      setMsg({ type: 'success', text: 'Announcement sent.' });
      setMessage('');
      router.refresh();
    }
    setSending(false);
  }

  async function handleArchive(id: string) {
    if (
      !(await confirm({
        title: 'Archive announcement',
        message: 'Archive this announcement? It will no longer be shown to participants.',
        confirmLabel: 'Archive',
        variant: 'danger',
      }))
    )
      return;
    setArchiving(id);
    const result = await archiveAnnouncementAction(id, tournamentSlug);
    if ('error' in result) setMsg({ type: 'error', text: result.error });
    else router.refresh();
    setArchiving(null);
  }

  return (
    <div className="space-y-8">
      {/* Compose form */}
      <div className="rounded-xl bg-surface-card ring-1 ring-surface-border p-6">
        <h2 className="mb-4 text-sm font-semibold text-white">Send announcement</h2>
        <form onSubmit={handleSend} className="space-y-4">
          <div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, MAX_CHARS))}
              placeholder="Write a message to all participants…"
              rows={4}
              className="w-full rounded-lg border border-slate-700 bg-surface px-4 py-3 text-sm text-slate-200 placeholder:text-slate-600 focus:border-brand-500 focus:outline-none resize-none"
            />
            <p className={`mt-1 text-right text-xs ${message.length >= MAX_CHARS ? 'text-red-400' : 'text-slate-600'}`}>
              {message.length}/{MAX_CHARS}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            {/* Urgency */}
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-500">Urgency</label>
              <select
                value={urgency}
                onChange={(e) => setUrgency(e.target.value as AnnouncementUrgency)}
                className="rounded-lg border border-slate-700 bg-surface px-3 py-1.5 text-sm text-slate-200 focus:border-brand-500 focus:outline-none"
              >
                <option value="normal">📢 Normal</option>
                <option value="urgent">🚨 Urgent</option>
              </select>
            </div>

            {/* Push notify toggle */}
            <label className="flex items-center gap-2 cursor-pointer">
              <div
                onClick={() => setPushNotify((v) => !v)}
                className={`relative h-5 w-9 rounded-full transition-colors ${
                  pushNotify ? 'bg-brand-600' : 'bg-slate-700'
                }`}
              >
                <div
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                    pushNotify ? 'translate-x-4' : 'translate-x-0.5'
                  }`}
                />
              </div>
              <span className="text-xs text-slate-400">Also push-notify participants</span>
            </label>

            <button
              type="submit"
              disabled={sending || !message.trim()}
              className="ml-auto rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
            >
              {sending ? 'Sending…' : 'Send'}
            </button>
          </div>
        </form>

        {msg && (
          <p className={`mt-3 text-sm ${msg.type === 'error' ? 'text-red-400' : 'text-accent-400'}`}>
            {msg.text}
          </p>
        )}
      </div>

      {/* Active announcements */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-white">
          Active{' '}
          <span className="text-xs font-normal text-slate-500">({active.length})</span>
        </h2>

        {active.length === 0 ? (
          <div className="rounded-xl bg-surface-card p-6 text-center ring-1 ring-surface-border">
            <p className="text-sm text-slate-500">No active announcements.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {active.map((a) => (
              <AnnouncementRow
                key={a.id}
                announcement={a}
                onArchive={() => handleArchive(a.id)}
                archiving={archiving === a.id}
              />
            ))}
          </div>
        )}
      </div>

      {/* Archived */}
      {archived.length > 0 && (
        <details className="group">
          <summary className="mb-3 flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-400 list-none">
            <span className="transition-transform group-open:rotate-90">▶</span>
            Archived ({archived.length})
          </summary>
          <div className="space-y-3 opacity-50">
            {archived.map((a) => (
              <AnnouncementRow key={a.id} announcement={a} archived />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function AnnouncementRow({
  announcement: a,
  onArchive,
  archiving = false,
  archived = false,
}: {
  announcement: Announcement;
  onArchive?: () => void;
  archiving?: boolean;
  archived?: boolean;
}) {
  const style = URGENCY_STYLE[a.urgency];
  const sentDate = new Date(a.sent_at).toLocaleString('en-AU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className={`rounded-xl bg-surface-card px-5 py-4 ring-1 ring-surface-border ${style.row}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${style.badge}`}>
              {a.urgency === 'urgent' ? '🚨 Urgent' : '📢 Normal'}
            </span>
            {a.also_push_notify && (
              <span className="rounded-full bg-brand-900/40 px-2 py-0.5 text-[10px] font-semibold text-brand-400">
                Push sent
              </span>
            )}
            <span className="text-xs text-slate-600">
              {a.sender_name ? `${a.sender_name} · ` : ''}{sentDate}
            </span>
          </div>
          <p className="text-sm text-slate-200 leading-relaxed">{a.message}</p>
        </div>

        {!archived && onArchive && (
          <button
            onClick={onArchive}
            disabled={archiving}
            className="shrink-0 text-xs text-slate-600 hover:text-red-400 transition-colors disabled:opacity-50"
          >
            {archiving ? '…' : 'Archive'}
          </button>
        )}
      </div>
    </div>
  );
}
