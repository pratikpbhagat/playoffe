'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { removeTeamAction, reassignTeamCaptainAction } from '@/lib/actions/teams';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { TeamDefaultLineupForm } from './TeamDefaultLineupForm';

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
  default_lineup?: { rubber_sequence: number; player_id: string; partner_id?: string | null }[] | null;
  default_lineup_enabled?: boolean | null;
}

interface Props {
  teams: Team[];
  tournamentId: string;
  /** Team-event only — when provided, each team's card gets a collapsible
   *  "Default lineup" toggle instead of needing a separate section/page. */
  rubberLineup?: { sequence: number; name: string; play_format: string }[];
}

function Avatar({ name, isCaptain }: { name: string; isCaptain?: boolean }) {
  return (
    <div className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${isCaptain ? 'bg-brand-600 text-white' : 'bg-brand-900 text-brand-300'}`}>
      {name[0]?.toUpperCase()}
    </div>
  );
}

export function TeamRosterList({ teams, tournamentId, rubberLineup }: Props) {
  const router = useRouter();
  const { confirm } = useConfirm();
  const [removing, setRemoving] = useState<string | null>(null);
  const [reassigningTeam, setReassigningTeam] = useState<string | null>(null);
  const [expandedLineupTeam, setExpandedLineupTeam] = useState<string | null>(null);

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

            {rubberLineup && rubberLineup.length > 0 && team.captain && (
              <div className="mt-3 -mx-4 -mb-4 border-t border-surface-border">
                <button
                  onClick={() => setExpandedLineupTeam((prev) => (prev === team.id ? null : team.id))}
                  className="w-full px-4 py-2 text-left flex items-center justify-between gap-3 hover:bg-surface-border/40 transition-colors"
                  title="Set this team's usual lineup once and reuse it across ties"
                >
                  <span className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
                    <span aria-hidden>📋</span>
                    Default lineup
                    {team.default_lineup_enabled ? (
                      <span className="ml-1 text-accent-400">✓ Applying to all ties</span>
                    ) : (
                      <span className="ml-1 rounded-full bg-brand-900/40 px-2 py-0.5 text-[10px] font-normal text-brand-300">
                        Click to set
                      </span>
                    )}
                  </span>
                  <span className={`shrink-0 text-slate-500 transition-transform ${expandedLineupTeam === team.id ? 'rotate-180' : ''}`}>▾</span>
                </button>
                {expandedLineupTeam === team.id && (
                  <TeamDefaultLineupForm team={team} rubberLineup={rubberLineup} />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
