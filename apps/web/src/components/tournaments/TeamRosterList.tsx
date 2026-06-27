'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { removeTeamAction } from '@/lib/actions/teams';
import { useConfirm } from '@/components/ui/ConfirmProvider';

interface Player {
  id: string;
  full_name: string;
  username: string;
}

interface TeamMember {
  id: string;
  status: string;
  player: Player | null;
}

interface Team {
  id: string;
  name: string;
  seed: number | null;
  status: string;
  captain: Player | null;
  team_members: TeamMember[];
}

interface Props {
  teams: Team[];
  tournamentId: string;
}

function Avatar({ name }: { name: string }) {
  return (
    <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-brand-900 text-xs font-bold text-brand-300">
      {name[0]?.toUpperCase()}
    </div>
  );
}

export function TeamRosterList({ teams, tournamentId }: Props) {
  const router = useRouter();
  const { confirm } = useConfirm();
  const [removing, setRemoving] = useState<string | null>(null);

  async function handleRemove(teamId: string, teamName: string) {
    if (!await confirm({
      title: 'Remove team',
      message: `Remove "${teamName}" from the category? They can re-register if spots are available.`,
      confirmLabel: 'Remove',
      variant: 'danger',
    })) return;
    setRemoving(teamId);
    await removeTeamAction(teamId, tournamentId);
    router.refresh();
    setRemoving(null);
  }

  if (teams.length === 0) {
    return (
      <div className="rounded-xl bg-surface-card p-8 text-center ring-1 ring-surface-border">
        <p className="text-sm text-slate-500">No teams entered yet. Add a team using the form below.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {teams.map((team) => {
        const confirmedMembers = team.team_members.filter((m) => m.status === 'active' && m.player);
        const pendingCount = team.team_members.filter((m) => m.status === 'provisional').length;
        return (
          <div key={team.id} className="rounded-xl bg-surface-card p-4 ring-1 ring-surface-border">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white">{team.name}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Captain:{' '}
                  {team.captain ? (
                    <Link href={`/p/${team.captain.username}`} className="hover:text-brand-300 transition-colors">
                      {team.captain.full_name}
                    </Link>
                  ) : 'Unknown'}
                  {pendingCount > 0 && (
                    <span className="ml-2 rounded-full bg-amber-900/40 px-2 py-0.5 text-[10px] text-amber-300">
                      {pendingCount} invite{pendingCount !== 1 ? 's' : ''} pending
                    </span>
                  )}
                </p>
              </div>
              <button
                onClick={() => handleRemove(team.id, team.name)}
                disabled={removing === team.id}
                className="shrink-0 text-xs text-slate-400 hover:text-red-400 transition-colors disabled:opacity-50"
                title="Remove team from category"
              >
                {removing === team.id ? '…' : '✕'}
              </button>
            </div>

            {confirmedMembers.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {confirmedMembers.map((m) => (
                  <div key={m.id} className="flex items-center gap-1.5 rounded-full bg-surface px-2 py-1">
                    <Avatar name={m.player!.full_name} />
                    <Link href={`/p/${m.player!.username}`} className="text-xs text-slate-300 hover:text-brand-300 transition-colors">
                      {m.player!.full_name}
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
