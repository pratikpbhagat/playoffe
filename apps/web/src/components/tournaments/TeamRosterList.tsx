'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { removeTeamAction, reassignTeamCaptainAction } from '@/lib/actions/teams';
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

export interface Team {
  id: string;
  name: string;
  seed: number | null;
  status: string;
  owner_name: string | null;
  captain: Player | null;
  marquee: Player | null;
  team_members: TeamMember[];
  composition_warning?: string | null;
}

interface Props {
  teams: Team[];
  tournamentId: string;
}

function Avatar({ name, isCaptain }: { name: string; isCaptain?: boolean }) {
  return (
    <div className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${isCaptain ? 'bg-brand-600 text-white' : 'bg-brand-900 text-brand-300'}`}>
      {name[0]?.toUpperCase()}
    </div>
  );
}

export function TeamRosterList({ teams, tournamentId }: Props) {
  const router = useRouter();
  const { confirm } = useConfirm();
  const [removing, setRemoving] = useState<string | null>(null);
  const [reassigningTeam, setReassigningTeam] = useState<string | null>(null);

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

  async function handleReassignCaptain(teamId: string, newCaptainId: string) {
    await reassignTeamCaptainAction(teamId, newCaptainId, tournamentId);
    setReassigningTeam(null);
    router.refresh();
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

        // Captain might also be a playing roster member — show one pill per
        // person, with the captain's pill highlighted, instead of duplicating
        // them or omitting them from the roster row entirely.
        const captainIsMember = team.captain && confirmedMembers.some((m) => m.player!.id === team.captain!.id);
        const pillPeople: { id: string; full_name: string; username: string; isCaptain: boolean }[] = [
          ...(team.captain && !captainIsMember ? [{ ...team.captain, isCaptain: true }] : []),
          ...confirmedMembers.map((m) => ({ ...m.player!, isCaptain: m.player!.id === team.captain?.id })),
        ];

        return (
          <div key={team.id} className="rounded-xl bg-surface-card p-4 ring-1 ring-surface-border">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white">
                  {team.composition_warning && <span className="mr-1.5" title={team.composition_warning}>⚠️</span>}
                  {team.name}
                  {team.owner_name && <span className="ml-2 text-xs font-normal text-slate-500">owned by {team.owner_name}</span>}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Captain:{' '}
                  {team.captain ? (
                    <Link href={`/p/${team.captain.username}`} className="hover:text-brand-300 transition-colors">
                      {team.captain.full_name}
                    </Link>
                  ) : 'Unknown'}
                  {team.marquee && (
                    <span className="ml-2 rounded-full bg-brand-900/40 px-2 py-0.5 text-[10px] text-brand-300">
                      ★ {team.marquee.full_name}
                    </span>
                  )}
                  {pendingCount > 0 && (
                    <span className="ml-2 rounded-full bg-amber-900/40 px-2 py-0.5 text-[10px] text-amber-300">
                      {pendingCount} invite{pendingCount !== 1 ? 's' : ''} pending
                    </span>
                  )}
                </p>
                {reassigningTeam === team.id ? (
                  <div className="mt-2 flex items-center gap-2">
                    <select
                      defaultValue=""
                      onChange={(e) => e.target.value && handleReassignCaptain(team.id, e.target.value)}
                      className="rounded border border-slate-600 bg-surface px-2 py-1 text-xs text-white outline-none"
                    >
                      <option value="" disabled>Choose new captain…</option>
                      {confirmedMembers.map((m) => (
                        <option key={m.player!.id} value={m.player!.id}>{m.player!.full_name}</option>
                      ))}
                    </select>
                    <button onClick={() => setReassigningTeam(null)} className="text-xs text-slate-500 hover:text-slate-300">Cancel</button>
                  </div>
                ) : (
                  confirmedMembers.length > 0 && (
                    <button
                      onClick={() => setReassigningTeam(team.id)}
                      className="mt-1.5 text-[11px] text-slate-500 hover:text-brand-300 transition-colors"
                    >
                      Reassign captain
                    </button>
                  )
                )}
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

            {pillPeople.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {pillPeople.map((p) => (
                  <div
                    key={p.id}
                    className={`flex items-center gap-1.5 rounded-full px-2 py-1 ${p.isCaptain ? 'bg-brand-900/40 ring-1 ring-brand-700/60' : 'bg-surface'}`}
                  >
                    <Avatar name={p.full_name} isCaptain={p.isCaptain} />
                    <Link href={`/p/${p.username}`} className={`text-xs transition-colors ${p.isCaptain ? 'text-brand-200 hover:text-brand-100' : 'text-slate-300 hover:text-brand-300'}`}>
                      {p.full_name}
                    </Link>
                    {p.isCaptain && <span className="text-[10px] text-brand-400">(C)</span>}
                  </div>
                ))}
              </div>
            )}

            {team.composition_warning && (
              <p className="mt-2 rounded bg-amber-900/20 px-2 py-1 text-[11px] text-amber-300">
                ⚠ {team.composition_warning}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
