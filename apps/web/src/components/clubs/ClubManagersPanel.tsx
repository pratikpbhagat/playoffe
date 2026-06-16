'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { addClubManagerAction, removeClubManagerAction } from '@/lib/actions/clubs';
import { useConfirm } from '@/components/ui/ConfirmProvider';

interface Manager {
  role: string;
  added_at: string;
  player: { id: string; full_name: string; username: string; photo_url: string | null } | null;
}

interface Props {
  clubId: string;
  managers: Manager[];
  isOwner: boolean;
  currentUserId: string;
}

export function ClubManagersPanel({ clubId, managers, isOwner, currentUserId }: Props) {
  const router = useRouter();
  const { confirm } = useConfirm();
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim()) return;
    setLoading(true);
    setMsg(null);
    const result = await addClubManagerAction(clubId, username.trim());
    if (result.error) {
      setMsg({ type: 'error', text: result.error });
    } else {
      setMsg({ type: 'success', text: `${result.playerName} added as manager.` });
      setUsername('');
      router.refresh();
    }
    setLoading(false);
  }

  async function handleRemove(playerId: string, name: string) {
    if (!await confirm({ title: 'Remove manager', message: `Remove ${name} as a club manager? They will lose access to manage this club.`, confirmLabel: 'Remove', variant: 'danger' })) return;
    setRemoving(playerId);
    const result = await removeClubManagerAction(clubId, playerId);
    if (result.error) setMsg({ type: 'error', text: result.error });
    else router.refresh();
    setRemoving(null);
  }

  return (
    <section className="mt-10">
      <h2 className="mb-4 text-base font-semibold text-white">Club managers</h2>

      {/* Manager list */}
      <div className="rounded-xl bg-surface-card ring-1 ring-surface-border overflow-hidden">
        {managers.map((m, i) => {
          const p = m.player;
          if (!p) return null;
          const isSelf = p.id === currentUserId;
          const joinedDate = new Date(m.added_at).toLocaleDateString('en-AU', {
            day: 'numeric', month: 'short', year: 'numeric',
          });
          return (
            <div
              key={p.id}
              className={`flex items-center justify-between gap-4 px-5 py-4 ${
                i > 0 ? 'border-t border-surface-border' : ''
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                {/* Avatar */}
                <div className="h-9 w-9 shrink-0 rounded-full bg-brand-600/30 flex items-center justify-center text-sm font-bold text-brand-400 overflow-hidden">
                  {p.photo_url ? (
                    <Image src={p.photo_url} alt="" width={36} height={36} className="h-full w-full object-cover" />
                  ) : (
                    p.full_name.charAt(0)
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-white truncate">{p.full_name}</p>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      m.role === 'owner'
                        ? 'bg-brand-600/20 text-brand-300'
                        : 'bg-slate-700/50 text-slate-400'
                    }`}>
                      {m.role === 'owner' ? 'Owner' : 'Manager'}
                    </span>
                    {isSelf && (
                      <span className="shrink-0 text-[10px] text-slate-600">(you)</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">@{p.username} · Joined {joinedDate}</p>
                </div>
              </div>

              {/* Remove button — owner only, can't remove self */}
              {isOwner && !isSelf && m.role !== 'owner' && (
                <button
                  onClick={() => handleRemove(p.id, p.full_name)}
                  disabled={removing === p.id}
                  className="shrink-0 text-xs text-slate-600 hover:text-red-400 transition-colors disabled:opacity-50"
                >
                  {removing === p.id ? '…' : 'Remove'}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Add manager form — owner only */}
      {isOwner && (
        <form onSubmit={handleAdd} className="mt-4 flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-48">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 text-sm">@</span>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="username"
              className="w-full rounded-lg border border-slate-700 bg-surface-card pl-7 pr-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-brand-500 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !username.trim()}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
          >
            {loading ? 'Adding…' : 'Add manager'}
          </button>
        </form>
      )}

      {msg && (
        <p className={`mt-3 text-sm ${msg.type === 'error' ? 'text-red-400' : 'text-accent-400'}`}>
          {msg.text}
        </p>
      )}
    </section>
  );
}
