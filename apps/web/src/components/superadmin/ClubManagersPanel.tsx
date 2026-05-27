'use client';

import { useState, useTransition } from 'react';
import {
  getClubManagersDetailAction,
  addClubManagerDirectAction,
  createManagerInviteAction,
  getClubPendingInvitesAction,
  revokeAdminInviteAction,
} from '@/lib/actions/superadmin';
import { PlayerSearchInput, type PlayerResult } from './PlayerSearchInput';
import { useConfirm } from '@/components/ui/ConfirmProvider';

interface Manager {
  id: string;
  role: string;
  player_id: string;
  players: { id: string; full_name: string; username: string; email: string } | null;
}

interface PendingInvite {
  id: string;
  invitee_email: string;
  invitee_name: string | null;
  expires_at: string;
}

interface Props {
  clubId: string;
  clubName: string;
}

export function ClubManagersPanel({ clubId, clubName }: Props) {
  const { confirm } = useConfirm();
  const [open, setOpen] = useState(false);
  const [managers, setManagers] = useState<Manager[] | null>(null);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [loadingManagers, setLoadingManagers] = useState(false);

  // Search + direct-add state
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerResult | null>(null);
  const [addResult, setAddResult] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState(false);
  const [addingDirect, startDirectTransition] = useTransition();

  // Invite state
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteResult, setInviteResult] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [sendingInvite, startInviteTransition] = useTransition();

  // Revoke state
  const [revokingId, setRevokingId] = useState<string | null>(null);

  async function loadData() {
    setLoadingManagers(true);
    const [mgrs, invites] = await Promise.all([
      getClubManagersDetailAction(clubId),
      getClubPendingInvitesAction(clubId),
    ]);
    setManagers(mgrs as Manager[]);
    setPendingInvites(invites);
    setLoadingManagers(false);
  }

  function handleToggle() {
    const next = !open;
    setOpen(next);
    if (next && managers === null) loadData();
  }

  function handleSelectPlayer(player: PlayerResult) {
    setSelectedPlayer(player);
    setAddResult(null);
    setAddSuccess(false);
  }

  function handleAddDirect() {
    if (!selectedPlayer) return;
    setAddResult(null);
    setAddSuccess(false);
    startDirectTransition(async () => {
      const result = await addClubManagerDirectAction(clubId, selectedPlayer.email);
      if ('error' in result) {
        setAddResult(result.error ?? 'Unknown error');
        setAddSuccess(false);
      } else {
        setAddResult(`✓ ${result.player.full_name} (@${result.player.username}) added as manager.`);
        setAddSuccess(true);
        setSelectedPlayer(null);
        loadData();
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
        // Refresh invites list to show the newly sent one
        const fresh = await getClubPendingInvitesAction(clubId);
        setPendingInvites(fresh);
      }
    });
  }

  async function handleRevoke(invite: PendingInvite) {
    const ok = await confirm({
      title: 'Revoke invite',
      message: `The pending invite for ${invite.invitee_email} will be cancelled. Their link will stop working immediately.`,
      confirmLabel: 'Revoke',
      variant: 'danger',
    });
    if (!ok) return;
    setRevokingId(invite.id);
    await revokeAdminInviteAction(invite.id);
    setPendingInvites((prev) => prev.filter((i) => i.id !== invite.id));
    setRevokingId(null);
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
        {pendingInvites.length > 0 && (
          <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-400">
            {pendingInvites.length} pending invite{pendingInvites.length !== 1 ? 's' : ''}
          </span>
        )}
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-5">
          {/* Manager list */}
          <div>
            {loadingManagers && <p className="text-xs text-slate-500">Loading…</p>}
            {managers !== null && managers.length === 0 && pendingInvites.length === 0 && (
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

          {/* Pending invites */}
          {pendingInvites.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold text-amber-400 uppercase tracking-wide">
                Pending invites
              </p>
              <div className="space-y-1.5">
                {pendingInvites.map((invite) => (
                  <div key={invite.id} className="flex items-center gap-3 rounded-lg border border-amber-700/30 bg-amber-950/20 px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-200 truncate">
                        {invite.invitee_name
                          ? <><span className="font-medium">{invite.invitee_name}</span> · {invite.invitee_email}</>
                          : invite.invitee_email}
                      </p>
                      <p className="text-xs text-slate-500">
                        Expires {new Date(invite.expires_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                    <button
                      onClick={() => handleRevoke(invite)}
                      disabled={revokingId === invite.id}
                      className="shrink-0 rounded-lg bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                    >
                      {revokingId === invite.id ? '…' : 'Revoke'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add existing user — typeahead search */}
          <div>
            <p className="mb-2 text-xs font-semibold text-slate-400 uppercase tracking-wide">Add existing user</p>

            {selectedPlayer ? (
              <div className="flex items-center gap-2 rounded-lg border border-brand-600/30 bg-brand-600/10 px-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">
                    {selectedPlayer.full_name}
                    <span className="ml-1.5 text-xs text-slate-400">@{selectedPlayer.username}</span>
                  </p>
                  <p className="text-xs text-slate-400 truncate">{selectedPlayer.email}</p>
                </div>
                <button
                  type="button"
                  onClick={handleAddDirect}
                  disabled={addingDirect}
                  className="shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
                >
                  {addingDirect ? '…' : 'Add as manager'}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedPlayer(null)}
                  className="shrink-0 text-slate-500 hover:text-slate-300 text-xs transition-colors"
                  aria-label="Clear selection"
                >
                  ✕
                </button>
              </div>
            ) : (
              <PlayerSearchInput
                onSelect={handleSelectPlayer}
                disabled={addingDirect}
              />
            )}

            {addResult && (
              <p className={`mt-1.5 text-xs ${addSuccess ? 'text-green-400' : 'text-red-400'}`}>
                {addResult}
              </p>
            )}
          </div>

          {/* Invite by email (for users who don't have an account yet) */}
          <div>
            <button
              type="button"
              onClick={() => setShowInvite((v) => !v)}
              className="mb-2 flex items-center gap-1 text-xs font-semibold text-slate-400 uppercase tracking-wide hover:text-slate-200 transition-colors"
            >
              <span className={`transition-transform text-[8px] ${showInvite ? 'rotate-90' : ''}`}>▶</span>
              Send invite link (user doesn&apos;t have an account yet)
            </button>

            {showInvite && (
              <form onSubmit={handleSendInvite} className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="Email address"
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
                {inviteResult && (
                  <p className="text-xs text-red-400">{inviteResult}</p>
                )}
                {inviteUrl && (
                  <div className="flex items-center gap-2 rounded-lg bg-surface px-3 py-2">
                    <p className="flex-1 truncate text-xs text-brand-400">{inviteUrl}</p>
                    <button
                      type="button"
                      onClick={copyInviteUrl}
                      className="shrink-0 rounded px-2 py-1 text-[10px] text-slate-400 border border-surface-border hover:border-slate-500 hover:text-slate-300 transition-colors"
                    >
                      Copy
                    </button>
                  </div>
                )}
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
