'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { addPlayerByEmailAction, searchPlayersForCategoryAction } from '@/lib/actions/categories';

interface Props {
  tournamentId: string;
  categoryId: string;
  /** Used to decide whether to show 1 or 2 search fields */
  playFormat?: 'singles' | 'doubles' | 'mixed_doubles';
}

export interface PlayerResult {
  id: string;
  full_name: string;
  username: string;
  email: string;
}

// ── Shared typeahead input ────────────────────────────────────────────────────

export interface SearchFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onClear: () => void;
  disabled?: boolean;
}

export function SearchField({ label, value, onChange, onClear, disabled }: SearchFieldProps) {
  const [results, setResults]     = useState<PlayerResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showDrop, setShowDrop]   = useState(false);
  const containerRef              = useRef<HTMLDivElement>(null);

  // Debounced search
  useEffect(() => {
    if (value.trim().length < 2) {
      setResults([]);
      setShowDrop(false);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      const data = await searchPlayersForCategoryAction(value);
      setResults(data);
      setShowDrop(data.length > 0);
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [value]);

  // Close on outside click
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDrop(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  function handleSelect(p: PlayerResult) {
    onChange(p.email);
    setResults([]);
    setShowDrop(false);
  }

  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-slate-400">{label}</p>
      <div ref={containerRef} className="relative">
        <input
          type="text"
          value={value}
          onChange={(e) => { onChange(e.target.value); }}
          onFocus={() => results.length > 0 && setShowDrop(true)}
          placeholder="Search by name, email or username…"
          autoComplete="off"
          disabled={disabled}
          className="w-full rounded-lg border border-slate-600 bg-surface px-3 py-2 pr-8 text-sm text-white outline-none placeholder:text-slate-500 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 transition disabled:opacity-50"
        />

        {/* Clear button */}
        {value && !disabled && (
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); onChange(''); onClear(); }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
            aria-label="Clear"
          >
            ✕
          </button>
        )}

        {/* Searching indicator */}
        {searching && !value && (
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
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function AddPlayerByEmail({ tournamentId, categoryId, playFormat = 'singles' }: Props) {
  const router  = useRouter();
  const isDoubles = playFormat === 'doubles' || playFormat === 'mixed_doubles';

  const [player1, setPlayer1]   = useState('');
  const [player2, setPlayer2]   = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [success, setSuccess]   = useState<string | null>(null);

  const canSubmit = isDoubles
    ? player1.trim() !== '' && player2.trim() !== ''
    : player1.trim() !== '';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setSuccess(null);
    setLoading(true);

    const result = await addPlayerByEmailAction(
      tournamentId,
      categoryId,
      player1.trim(),
      isDoubles ? player2.trim() : undefined,
    );

    if (result.error) {
      setError(result.error);
    } else {
      const replaced = 'replaced' in result && result.replaced;
      setSuccess(
        replaced
          ? isDoubles
            ? 'Pair replaced the withdrawn slot and their matches have been reset.'
            : 'Player replaced the withdrawn slot and their matches have been reset.'
          : isDoubles
            ? 'Pair added successfully.'
            : 'Player added successfully.',
      );
      setPlayer1('');
      setPlayer2('');
      router.refresh();
    }
    setLoading(false);
  }

  const formatLabel = playFormat === 'mixed_doubles'
    ? 'mixed doubles'
    : playFormat === 'doubles'
    ? 'doubles'
    : 'singles';

  return (
    <div className="rounded-xl bg-surface-card p-5 ring-1 ring-surface-border">
      <h3 className="mb-1 text-sm font-semibold text-white">
        Add {isDoubles ? 'pair' : 'player'}
      </h3>
      <p className="mb-4 text-xs text-slate-500">
        {isDoubles
          ? `This is a ${formatLabel} category — search and select both players.`
          : 'Search by name, username or email. For new players, use CSV import below.'}
      </p>

      <form onSubmit={handleSubmit} className="space-y-3">
        <SearchField
          label={isDoubles ? 'Player 1 (main)' : 'Player'}
          value={player1}
          onChange={setPlayer1}
          onClear={() => setError(null)}
          disabled={loading}
        />

        {isDoubles && (
          <SearchField
            label="Player 2 (partner)"
            value={player2}
            onChange={setPlayer2}
            onClear={() => setError(null)}
            disabled={loading}
          />
        )}

        <div className="flex justify-end pt-1">
          <button
            type="submit"
            disabled={loading || !canSubmit}
            className="shrink-0 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
          >
            {loading ? 'Adding…' : isDoubles ? 'Add pair' : 'Add player'}
          </button>
        </div>
      </form>

      {error   && <p className="mt-2 text-xs text-red-400">{error}</p>}
      {success && <p className="mt-2 text-xs text-accent-400">{success}</p>}
    </div>
  );
}
