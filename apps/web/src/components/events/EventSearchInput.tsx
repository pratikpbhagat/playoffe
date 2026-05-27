'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { searchEventSuggestionsAction, type EventSuggestion } from '@/lib/actions/events';

interface Props {
  defaultValue?: string;
}

const TYPE_ICON: Record<EventSuggestion['type'], string> = {
  tournament: '🏆',
  club:       '🏟️',
  venue:      '📍',
};

const TYPE_LABEL: Record<EventSuggestion['type'], string> = {
  tournament: 'Event',
  club:       'Club',
  venue:      'Venue',
};

export function EventSearchInput({ defaultValue }: Props) {
  const router = useRouter();
  const [query, setQuery]           = useState(defaultValue ?? '');
  const [suggestions, setSuggestions] = useState<EventSuggestion[]>([]);
  const [showDrop, setShowDrop]     = useState(false);
  const [searching, setSearching]   = useState(false);
  const containerRef                = useRef<HTMLDivElement>(null);

  // Debounced search
  useEffect(() => {
    if (query.trim().length < 2) {
      setSuggestions([]);
      setShowDrop(false);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      const data = await searchEventSuggestionsAction(query);
      setSuggestions(data);
      setShowDrop(data.length > 0);
      setSearching(false);
    }, 300);
    return () => clearTimeout(timer);
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

  function handleSelect(s: EventSuggestion) {
    setShowDrop(false);
    if (s.type === 'tournament') {
      // Go directly to the tournament's event page
      router.push(`/events/${s.slug}`);
    } else {
      // Fill the search box and run a new search
      setQuery(s.query);
      router.push(`/events?q=${encodeURIComponent(s.query)}`);
    }
  }

  return (
    <div ref={containerRef} className="relative flex-1 min-w-56">
      <input
        type="search"
        name="q"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => suggestions.length > 0 && setShowDrop(true)}
        placeholder="Search by name, venue or club…"
        autoComplete="off"
        className="w-full rounded-lg border border-surface-border bg-surface-card px-4 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-brand-500 focus:outline-none"
      />

      {/* Subtle searching indicator */}
      {searching && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-600">
          Searching…
        </span>
      )}

      {/* Suggestions dropdown */}
      {showDrop && suggestions.length > 0 && (
        <ul className="absolute z-50 mt-1.5 w-full rounded-xl border border-surface-border bg-surface-card shadow-2xl overflow-hidden">
          {suggestions.map((s, i) => (
            <li key={i}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); handleSelect(s); }}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-surface transition-colors"
              >
                {/* Type icon + label */}
                <span className="shrink-0 flex items-center gap-1 text-[11px] text-slate-500 w-16">
                  <span>{TYPE_ICON[s.type]}</span>
                  <span>{TYPE_LABEL[s.type]}</span>
                </span>

                {/* Name + sublabel */}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate">{s.label}</p>
                  {s.type === 'tournament' && s.sublabel && (
                    <p className="text-xs text-slate-500 truncate">{s.sublabel}</p>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
