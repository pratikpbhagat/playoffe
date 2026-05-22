'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { addPlayerByEmailAction } from '@/lib/actions/categories';

interface Props {
  tournamentId: string;
  categoryId: string;
}

export function AddPlayerByEmail({ tournamentId, categoryId }: Props) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setError(null);
    setSuccess(null);
    setLoading(true);

    const result = await addPlayerByEmailAction(tournamentId, categoryId, email.trim());

    if (result.error) {
      setError(result.error);
    } else {
      setSuccess(`Player added successfully.`);
      setEmail('');
      router.refresh();
    }
    setLoading(false);
  }

  return (
    <div className="rounded-xl bg-surface-card p-5 ring-1 ring-surface-border">
      <h3 className="mb-3 text-sm font-semibold text-white">Add player by email</h3>
      <p className="mb-4 text-xs text-slate-500">
        The player must already have a PLAYOFFE account. For new players, use CSV import below.
      </p>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="player@example.com"
          required
          className="flex-1 rounded-lg border border-slate-600 bg-surface px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 transition"
        />
        <button
          type="submit"
          disabled={loading || !email.trim()}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
        >
          {loading ? 'Adding…' : 'Add'}
        </button>
      </form>

      {error && (
        <p className="mt-2 text-xs text-red-400">{error}</p>
      )}
      {success && (
        <p className="mt-2 text-xs text-accent-400">{success}</p>
      )}
    </div>
  );
}
