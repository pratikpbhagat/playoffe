'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { confirmTeamInviteAction, declineTeamInviteAction } from '@/lib/actions/teams';
import { useConfirm } from '@/components/ui/ConfirmProvider';

interface Invite {
  id: string;
  invited_at: string;
  tournament_teams: {
    id: string;
    name: string;
    captain: { full_name: string; username: string } | null;
    tournament_categories: { id: string; name: string } | null;
    tournaments: { id: string; name: string; slug: string; start_date: string } | null;
  } | null;
}

interface Props {
  invites: Invite[];
}

export function TeamInvitesBanner({ invites: initialInvites }: Props) {
  const router = useRouter();
  const { confirm } = useConfirm();
  const [invites, setInvites] = useState(initialInvites);
  const [acting, setActing] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});

  if (invites.length === 0) return null;

  async function handleConfirm(invite: Invite) {
    setActing(invite.id);
    const result = await confirmTeamInviteAction(invite.id);
    if (result.error) {
      setMessages((m) => ({ ...m, [invite.id]: result.error! }));
    } else {
      setMessages((m) => ({ ...m, [invite.id]: "Confirmed! You're on the roster." }));
      setInvites((prev) => prev.filter((i) => i.id !== invite.id));
      router.refresh();
    }
    setActing(null);
  }

  async function handleDecline(invite: Invite) {
    const team = invite.tournament_teams;
    if (!await confirm({ title: 'Decline team invite?', message: `Decline the roster invite for "${team?.name}"?`, confirmLabel: 'Decline', variant: 'danger' })) return;
    setActing(invite.id);
    const result = await declineTeamInviteAction(invite.id);
    if (result.error) {
      setMessages((m) => ({ ...m, [invite.id]: result.error! }));
    } else {
      setInvites((prev) => prev.filter((i) => i.id !== invite.id));
      router.refresh();
    }
    setActing(null);
  }

  return (
    <div className="lg:col-span-3 rounded-xl bg-brand-950/40 ring-1 ring-brand-700/50 p-6">
      <div className="flex items-center gap-2 mb-4">
        <span className="h-2 w-2 rounded-full bg-brand-400 animate-pulse" />
        <h2 className="text-base font-semibold text-white">
          Team invite{invites.length !== 1 ? 's' : ''}
        </h2>
        <span className="rounded-full bg-brand-600/30 px-2 py-0.5 text-xs font-bold text-brand-300">
          {invites.length}
        </span>
      </div>

      <div className="space-y-3">
        {invites.map((invite) => {
          const team = invite.tournament_teams;
          const t = team?.tournaments;
          const cat = team?.tournament_categories;
          const captain = team?.captain;
          const msg = messages[invite.id];

          return (
            <div
              key={invite.id}
              className="flex items-center gap-4 rounded-xl bg-surface-card px-5 py-4 ring-1 ring-brand-700/30 flex-wrap"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white">
                  {captain ? (
                    <Link href={`/p/${captain.username}`} className="hover:text-brand-300 transition-colors">
                      {captain.full_name}
                    </Link>
                  ) : 'Someone'}
                  {' '}added you to {team?.name ?? 'a team'}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {t?.name ?? 'Tournament'} · {cat?.name ?? ''}
                  {t?.start_date && (
                    <> · {new Date(t.start_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</>
                  )}
                </p>
                {msg && <p className="mt-1 text-xs text-brand-400">{msg}</p>}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => handleConfirm(invite)}
                  disabled={acting === invite.id}
                  className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
                >
                  {acting === invite.id ? '…' : 'Accept'}
                </button>
                <button
                  onClick={() => handleDecline(invite)}
                  disabled={acting === invite.id}
                  className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:border-red-600 hover:text-red-400 transition-colors disabled:opacity-50"
                >
                  Decline
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
