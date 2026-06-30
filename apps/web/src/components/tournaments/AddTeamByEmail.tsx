'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { addTeamByOrganizerAction } from '@/lib/actions/teams';
import { SearchField } from './AddPlayerByEmail';

interface Props {
  tournamentId: string;
  categoryId: string;
}

export function AddTeamByEmail({ tournamentId, categoryId }: Props) {
  const router = useRouter();

  const [teamName, setTeamName] = useState('');
  const [memberEmails, setMemberEmails] = useState<string[]>(['']);
  const [captainEmail, setCaptainEmail] = useState('');
  const [marqueeEmail, setMarqueeEmail] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const cleanedMemberEmails = memberEmails.map((e) => e.trim()).filter(Boolean);
  const canSubmit = teamName.trim() !== '' && cleanedMemberEmails.length > 0 && captainEmail.trim() !== '';

  function updateMember(i: number, value: string) {
    const next = [...memberEmails];
    next[i] = value;
    setMemberEmails(next);
    // If the captain's email was removed/edited away, clear the selection.
    if (captainEmail && !next.map((e) => e.trim()).includes(captainEmail)) setCaptainEmail('');
  }

  function removeMember(i: number) {
    const removedEmail = memberEmails[i].trim();
    const next = memberEmails.filter((_, j) => j !== i);
    setMemberEmails(next);
    if (captainEmail === removedEmail) setCaptainEmail('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setSuccess(null);
    setLoading(true);

    const result = await addTeamByOrganizerAction(
      tournamentId,
      categoryId,
      teamName.trim(),
      cleanedMemberEmails,
      captainEmail.trim(),
      marqueeEmail.trim() || undefined,
      ownerName.trim() || undefined,
    );

    if (result.error) {
      setError(result.error);
    } else {
      setSuccess(result.warning ? `Team added. ⚠ ${result.warning}` : 'Team added successfully.');
      setTeamName('');
      setMemberEmails(['']);
      setCaptainEmail('');
      setMarqueeEmail('');
      setOwnerName('');
      router.refresh();
    }
    setLoading(false);
  }

  return (
    <div className="rounded-xl bg-surface-card p-5 ring-1 ring-surface-border">
      <h3 className="mb-1 text-sm font-semibold text-white">Add team</h3>
      <p className="mb-4 text-xs text-slate-500">
        Create a team directly — captain and roster members are added as confirmed immediately, no invite needed.
      </p>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <p className="mb-1.5 text-xs font-medium text-slate-400">Team name</p>
          <input
            type="text"
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            placeholder="e.g. The Smashers"
            disabled={loading}
            className="w-full rounded-lg border border-slate-600 bg-surface px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 transition disabled:opacity-50"
          />
        </div>

        <div>
          <p className="mb-1.5 text-xs font-medium text-slate-400">Owner <span className="text-slate-500">(display only, optional)</span></p>
          <input
            type="text"
            value={ownerName}
            onChange={(e) => setOwnerName(e.target.value)}
            placeholder="e.g. Acme Corp"
            disabled={loading}
            className="w-full rounded-lg border border-slate-600 bg-surface px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 transition disabled:opacity-50"
          />
        </div>

        <SearchField
          label="Marquee player (optional, display only — must be a roster member)"
          value={marqueeEmail}
          onChange={setMarqueeEmail}
          onClear={() => setError(null)}
          disabled={loading}
        />

        <div>
          <p className="mb-1.5 text-xs font-medium text-slate-400">
            Roster members <span className="text-slate-500">(pick which one is captain)</span>
          </p>
          <div className="space-y-2">
            {memberEmails.map((email, i) => {
              const trimmed = email.trim();
              return (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="captain"
                    checked={trimmed !== '' && captainEmail === trimmed}
                    onChange={() => setCaptainEmail(trimmed)}
                    disabled={loading || trimmed === ''}
                    title="Make captain"
                    className="shrink-0 accent-brand-600"
                  />
                  <div className="flex-1">
                    <SearchField
                      label=""
                      value={email}
                      onChange={(v) => updateMember(i, v)}
                      onClear={() => setError(null)}
                      disabled={loading}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeMember(i)}
                    disabled={memberEmails.length <= 1}
                    className="px-2 text-slate-500 hover:text-red-400 disabled:opacity-30 transition-colors"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => setMemberEmails([...memberEmails, ''])}
            className="mt-2 text-xs font-medium text-brand-400 hover:text-brand-300 transition-colors"
          >
            + Add roster member
          </button>
        </div>

        <div className="flex justify-end pt-1">
          <button
            type="submit"
            disabled={loading || !canSubmit}
            className="shrink-0 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
          >
            {loading ? 'Adding…' : 'Add team'}
          </button>
        </div>
      </form>

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      {success && <p className="mt-2 text-xs text-accent-400">{success}</p>}
    </div>
  );
}
