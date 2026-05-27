'use client';

import { useState, useTransition } from 'react';
import {
  getClubManagersDetailAction,
  addClubManagerDirectAction,
  createManagerInviteAction,
} from '@/lib/actions/superadmin';

interface Manager {
  id: string;
  role: string;
  player_id: string;
  players: { id: string; full_name: string; username: string; email: string } | null;
}

interface Props {
  clubId: string;
  clubName: string;
}

export function ClubManagersPanel({ clubId, clubName }: Props) {
  const [open, setOpen] = useState(false);
  const [managers, setManagers] = useState<Manager[] | null>(null);
  const [loadingManagers, setLoadingManagers] = useState(false);

  // Direct add state
  const [directEmail, setDirectEmail] = useState('');
  const [directResult, setDirectResult] = useState<string | null>(null);
  const [directSuccess, setDirectSuccess] = useState(false);
  const [addingDirect, startDirectTransition] = useTransition();

  // Invite state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteResult, setInviteResult] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [sendingInvite, startInviteTransition] = useTransition();

  async function loadManagers() {
    setLoadingManagers(true);
    const data = await getClubManagersDetailAction(clubId);
    setManagers(data as Manager[]);
    setLoadingManagers(false);
  }

  function handleToggle() {
    const next = !open;
    setOpen(next);
    if (next && managers === null) {
      loadManagers();
    }
  }

  function handleAddDirect(e: React.FormEvent) {
    e.preventDefault();
    setDirectResult(null);
    setDirectSuccess(false);
    startDirectTransition(async () => {
      const result = await addClubManagerDirectAction(clubId, directEmail.trim());
      if ('error' in result) {
        setDirectResult(result.error ?? 'Unknown error');
        setDirectSuccess(false);
      } else {
        setDirectResult(`✓ ${result.player.full_name} (@${result.player.username}) added as manager.`);
        setDirectSuccess(true);
        setDirectEmail('');
        loadManagers();
      }
    });
  }

  function handleSendInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteResult(null);
    setInviteUrl(null);
    startInviteTransition(async () => {
      const result = await createManagerInviteAction({
        clubId,
        clubName,
        inviteeEmail: inviteEmail.trim(),
        inviteeName: inviteName.trim() || undefined,
      });
      if ('error' in result) {
        setInviteResult(result.error ?? 'Unknown error');
      } else {
        setInviteUrl(result.inviteUrl);
        setInviteEmail('');
        setInviteName('');
      }
    });
  }

  function copyInviteUrl() {
    if (inviteUrl) navigator.clipboard.writeText(inviteUrl);
  }

  const ROLE_STYLE: Record<string, string> = {
    owner:   'bg-amber-500/20 text-amber-300',
    manager: 'bg-brand-500/20 text-brand-300',
  };

  return (
    <div className="border-t border-surface-border">
      <button
        onClick={handleToggle}
        className="w-full flex items-center gap-2 px-5 py-2.5 text-xs text-slate-500 hover:text-slate-300 transition-colors text-left"
      >
        <span className={`transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
        Managers
        {managers !== null && (
          <span className="ml-1 rounded-full bg-surface-border px-1.5 py-0.5 text-[10px] text-slate-400">
            {managers.length}
          </span>
        )}
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-5">
          {/* Manager list */}
          <div>
            {loadingManagers && <p className="text-xs text-slate-500">Loading…</p>}
            {managers !== null && managers.length === 0 && (
              <p className="text-xs text-slate-500">No managers yet.</p>
            )}
            {managers !== null && managers.length > 0 && (
              <div className="space-y-1.5">
                {managers.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 rounded-lg bg-surface px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">
                        {m.players?.full_name ?? 'Unknown'}
                        <span className="ml-1.5 text-xs text-slate-500">@{m.players?.username}</span>
                      </p>
                      <p className="text-xs text-slate-500 truncate">{m.players?.email}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${ROLE_STYLE[m.role] ?? 'bg-slate-700 text-slate-300'}`}>
                      {m.role}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add existing user */}
          <div>
            <p className="mb-2 text-xs font-semibold text-slate-400 uppercase tracking-wide">Add existing user</p>
            <form onSubmit={handleAddDirect} className="flex gap-2">
              <input
                type="email"
                value={directEmail}
                onChange={(e) => setDirectEmail(e.target.value)}
                placeholder="player@email.com"
                required
                className="flex-1 rounded-lg border border-surface-border bg-surface px-3 py-1.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-brand-500"
              />
              <button
                type="submit"
                disabled={addingDirect}
                className="shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
              >
                {addingDirect ? '…' : 'Add'}
              </button>
            </form>
            {directResult && (
              <p className={`mt-1.5 text-xs ${directSuccess ? 'text-green-400' : 'text-red-400'}`}>
                {directResult}
              </p>
            )}
          </div>

          {/* Send invite link */}
          <div>
            <p className="mb-2 text-xs font-semibold text-slate-400 uppercase tracking-wide">Send invite link</p>
            <form onSubmit={handleSendInvite} className="space-y-2">
              <div className="flex gap-2">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="Email"
                  required
                  className="flex-1 rounded-lg border border-surface-border bg-surface px-3 py-1.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-brand-500"
                />
                <input
                  type="text"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  placeholder="Name (optional)"
                  className="flex-1 rounded-lg border border-surface-border bg-surface px-3 py-1.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-brand-500"
                />
                <button
                  type="submit"
                  disabled={sendingInvite}
                  className="shrink-0 rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-300 hover:border-brand-500 hover:text-brand-400 disabled:opacity-50 transition-colors"
                >
                  {sendingInvite ? '…' : 'Send invite'}
                </button>
              </div>
            </form>
            {inviteUrl && (
              <div className="mt-2 flex items-center gap-2 rounded-lg bg-surface px-3 py-2">
                <p className="flex-1 truncate text-xs text-brand-400">{inviteUrl}</p>
                <button
                  onClick={copyInviteUrl}
                  className="shrink-0 rounded px-2 py-1 text-[10px] text-slate-400 border border-surface-border hover:border-slate-500 hover:text-slate-300 transition-colors"
                >
                  Copy
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
