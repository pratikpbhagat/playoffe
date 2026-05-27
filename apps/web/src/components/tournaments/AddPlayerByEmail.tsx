'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { addPlayerByEmailAction, searchPlayersForCategoryAction } from '@/lib/actions/categories';

interface Props {
  tournamentId: string;
  categoryId: string;
}

interface PlayerResult {
  id: string;
  full_name: string;
  username: string;
  email: string;
}

export function AddPlayerByEmail({ tournamentId, categoryId }: Props) {
  const router = useRouter();
  const [query, setQuery]           = useState('');
  const [results, setResults]       = useState<PlayerResult[]>([]);
  const [searching, setSearching]   = useState(false);
  const [showDrop, setShowDrop]     = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [success, setSuccess]       = useState<string | null>(null);
  const containerRef                = useRef<HTMLDivElement>(null);

  // Debounced search
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setShowDrop(false);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      const data = await searchPlayersForCategoryAction(query);
      setResults(data);
      setShowDrop(data.length > 0);
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  // Close dropdown on outside click
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDrop(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  function handleSelect(player: PlayerResult) {
    setQuery(player.email);
    setResults([]);
    setShowDrop(false);
    setError(null);
    setSuccess(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setError(null);
    setSuccess(null);
    setLoading(true);

    const result = await addPlayerByEmailAction(tournamentId, categoryId, query.trim());

    if (result.error) {
      setError(result.error);
    } else {
      setSuccess('Player added successfully.');
      setQuery('');
      router.refresh();
    }
    setLoading(false);
  }

  return (
    <div className="rounded-xl bg-surface-card p-5 ring-1 ring-surface-border">
      <h3 className="mb-3 text-sm font-semibold text-white">Add player by email</h3>
      <p className="mb-4 text-xs text-slate-500">
        Search by name, username or email. For new players, use CSV import below.
      </p>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <div ref={containerRef} className="relative flex-1">
          <input
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setError(null); setSuccess(null); }}
            onFocus={() => results.length > 0 && setShowDrop(true)}
            placeholder="Search by name, email or username…"
            autoComplete="off"
            className="w-full rounded-lg border border-slate-600 bg-surface px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 transition"
          />

          {/* Searching indicator */}
          {searching && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">
              Searching…
            </span>
          )}

          {/* Dropdown */}
          {showDrop && results.length > 0 && (
            <ul className="absolute z-50 mt-1 w-full rounded-lg border border-surface-border bg-surface-card shadow-xl overflow-hidden">
              {results.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); handleSelect(p); }}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-surface transition-colors"
                  >
                    {/* Avatar initial */}
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-900 text-xs font-bold text-brand-300">
                      {(p.full_name?.[0] ?? p.email[0]).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">{p.full_name}</p>
                      <p className="text-xs text-slate-500 truncate">
                        @{p.username} · {p.email}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="shrink-0 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
        >
          {loading ? 'Adding…' : 'Add'}
        </button>
      </form>

      {error   && <p className="mt-2 text-xs text-red-400">{error}</p>}
      {success && <p className="mt-2 text-xs text-accent-400">{success}</p>}
    </div>
  );
}
