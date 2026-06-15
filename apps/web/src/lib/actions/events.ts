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

  // Match tournament name/venue and club name at the DB level instead of fetching
  // every tournament and filtering in JS.
  const [{ data: tournamentRows }, { data: clubRows }] = await Promise.all([
    admin
      .from('tournaments')
      .select('id, name, slug, venue, clubs!inner(name)')
      .not('status', 'eq', 'cancelled')
      .or(`name.ilike.%${q}%,venue.ilike.%${q}%`)
      .order('start_date', { ascending: true })
      .limit(20),
    admin
      .from('clubs')
      .select('name')
      .ilike('name', `%${q}%`)
      .limit(10),
  ]);

  type Row = { id: string; name: string; slug: string; venue: string | null; clubs: { name: string } };
  const rows = (tournamentRows ?? []) as unknown as Row[];

  const suggestions: EventSuggestion[] = [];
  const seenVenues = new Set<string>();

  for (const t of rows) {
    const nameMatch  = t.name.toLowerCase().includes(q);
    const venueMatch = (t.venue ?? '').toLowerCase().includes(q);

    // Direct tournament match → link to that event
    if (nameMatch) {
      suggestions.push({
        type: 'tournament',
        label: t.name,
        sublabel: t.clubs.name,
        slug: t.slug,
      });
    }

    // Venue match → de-duped filter suggestion
    if (venueMatch && t.venue && !seenVenues.has(t.venue)) {
      seenVenues.add(t.venue);
      suggestions.push({ type: 'venue', label: t.venue, query: t.venue });
    }
  }

  // Club name match → filter suggestion
  for (const c of clubRows ?? []) {
    suggestions.push({ type: 'club', label: c.name, query: c.name });
  }

  return suggestions.slice(0, 8);
}
