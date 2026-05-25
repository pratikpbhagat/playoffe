'use client';

import { useState } from 'react';
import { sendTournamentInvitesAction } from '@/lib/actions/invites';

interface ResultRow {
  username: string;
  status: 'sent' | 'already_registered' | 'not_found' | 'error';
  name?: string;
}

interface Props {
  tournamentId: string;
}

const STATUS_CONFIG = {
  sent: { icon: '✓', label: 'Invite sent', color: 'text-accent-400' },
  already_registered: { icon: '–', label: 'Already registered', color: 'text-slate-500' },
  not_found: { icon: '✕', label: 'Player not found', color: 'text-red-400' },
  error: { icon: '!', label: 'Failed to send', color: 'text-red-400' },
};

export function InvitePlayersPanel({ tournamentId }: Props) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<ResultRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSend() {
    const usernames = text
      .split(/[\n,]+/)
      .map((u) => u.trim().replace(/^@/, ''))
      .filter(Boolean);

    if (usernames.length === 0) return;

    setSending(true);
    setError(null);
    setResults(null);

    const result = await sendTournamentInvitesAction(tournamentId, usernames);

    if (result.error) {
      setError(result.error);
    } else {
      setResults(result.results ?? []);
      // Clear sent usernames from the text box
      const notSent = (result.results ?? [])
        .filter((r) => r.status !== 'sent')
        .map((r) => r.username);
      setText(notSent.join('\n'));
    }
    setSending(false);
  }

  const sentCount = results?.filter((r) => r.status === 'sent').length ?? 0;

  return (
    <section className="mt-8 rounded-2xl bg-surface-card ring-1 ring-surface-border overflow-hidden">
      <div className="border-b border-surface-border px-5 py-4">
        <h3 className="text-sm font-semibold text-white">Invite players</h3>
        <p className="mt-0.5 text-xs text-slate-500">
          Enter PLAYOFFE usernames (one per line or comma-separated). Players will receive an email and an in-app notification.
        </p>
      </div>

      <div className="px-5 py-5 space-y-4">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          placeholder={'pratikb\nalicewong\njohnsmith'}
          className="w-full rounded-xl border border-slate-700 bg-surface px-4 py-3 text-sm text-slate-200 placeholder:text-slate-600 focus:border-brand-500 focus:outline-none resize-none font-mono"
        />

        <div className="flex items-center gap-3">
          <button
            onClick={handleSend}
            disabled={sending || text.trim().length === 0}
            className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-40"
          >
            {sending ? 'Sending…' : 'Send invites'}
          </button>
          {results && (
            <p className="text-xs text-slate-500">
              {sentCount} invite{sentCount !== 1 ? 's' : ''} sent
            </p>
          )}
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        {/* Results */}
        {results && results.length > 0 && (
          <div className="rounded-xl border border-surface-border divide-y divide-surface-border overflow-hidden">
            {results.map((r) => {
              const cfg = STATUS_CONFIG[r.status];
              return (
                <div key={r.username} className="flex items-center justify-between px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold ${cfg.color}`}>{cfg.icon}</span>
                    <div>
                      <p className="text-sm text-white font-mono">@{r.username}</p>
                      {r.name && <p className="text-xs text-slate-500">{r.name}</p>}
                    </div>
                  </div>
                  <span className={`text-xs ${cfg.color}`}>{cfg.label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
