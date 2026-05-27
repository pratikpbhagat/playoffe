'use server';

import { createAdminClient } from '@/lib/supabase/server';

export type EventSuggestion =
  | { type: 'tournament'; label: string; sublabel: string; slug: string }
  | { type: 'club';       label: string; query: string }
  | { type: 'venue';      label: string; query: string };

/**
 * Returns typeahead suggestions for the events page search bar.
 * Matches against tournament name, club name, and venue (case-insensitive).
 */
export async function searchEventSuggestionsAction(query: string): Promise<EventSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const q = trimmed.toLowerCase();
  const admin = createAdminClient();

  const { data } = await admin
    .from('tournaments')
    .select('id, name, slug, venue, clubs!inner(name)')
    .not('status', 'eq', 'cancelled')
    .order('start_date', { ascending: true });

  if (!data) return [];

  type Row = { id: string; name: string; slug: string; venue: string | null; clubs: { name: string } };
  const rows = data as unknown as Row[];

  const suggestions: EventSuggestion[] = [];
  const seenClubs  = new Set<string>();
  const seenVenues = new Set<string>();

  for (const t of rows) {
    const nameMatch  = t.name.toLowerCase().includes(q);
    const venueMatch = (t.venue ?? '').toLowerCase().includes(q);
    const clubMatch  = t.clubs.name.toLowerCase().includes(q);

    if (!nameMatch && !venueMatch && !clubMatch) continue;

    // Direct tournament match → link to that event
    if (nameMatch) {
      suggestions.push({
        type: 'tournament',
        label: t.name,
        sublabel: t.clubs.name,
        slug: t.slug,
      });
    }

    // Club match → de-duped filter suggestion
    if (clubMatch && !seenClubs.has(t.clubs.name)) {
      seenClubs.add(t.clubs.name);
      suggestions.push({ type: 'club', label: t.clubs.name, query: t.clubs.name });
    }

    // Venue match → de-duped filter suggestion
    if (venueMatch && t.venue && !seenVenues.has(t.venue)) {
      seenVenues.add(t.venue);
      suggestions.push({ type: 'venue', label: t.venue, query: t.venue });
    }
  }

  return suggestions.slice(0, 8);
}
