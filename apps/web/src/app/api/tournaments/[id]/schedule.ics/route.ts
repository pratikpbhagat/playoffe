import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

/**
 * GET /api/tournaments/[id]/schedule.ics
 *
 * Returns an iCalendar (.ics) file for all scheduled matches in a tournament.
 * Works with the URL slug (same as tournament pages).
 * Clients can subscribe via webcal:// or download directly.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: slug } = await params;
  const admin = createAdminClient();

  const { data: t } = await admin
    .from('tournaments')
    .select('id, name, slug, start_date, venue, status')
    .eq('slug', slug)
    .single();

  // Draft tournaments aren't public yet — don't leak their schedule/player
  // names via this unauthenticated calendar feed. (Matches the same
  // "status <> 'draft'" public-visibility rule used elsewhere, e.g. the
  // tournaments_select RLS policy.)
  if (!t || t.status === 'draft') {
    return new NextResponse('Tournament not found', { status: 404 });
  }

  const { data: matches } = await admin
    .from('matches')
    .select(`
      id, court, scheduled_time, status,
      ea:tournament_entries!entry_a_id(players!player_id(full_name)),
      eb:tournament_entries!entry_b_id(players!player_id(full_name)),
      tc:tournament_categories!category_id(name)
    `)
    .eq('tournament_id', t.id)
    .not('scheduled_time', 'is', null)
    .not('entry_a_id', 'is', null)
    .not('entry_b_id', 'is', null)
    .order('scheduled_time');

  type MatchRow = {
    id: string;
    court: number | null;
    scheduled_time: string;
    status: string;
    ea: { players: { full_name: string } | null } | null;
    eb: { players: { full_name: string } | null } | null;
    tc: { name: string } | null;
  };

  const rows = (matches ?? []) as unknown as MatchRow[];

  const ics = buildIcs(t.name, rows, t.venue as string | null);

  return new NextResponse(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${t.slug}-schedule.ics"`,
      'Cache-Control': 'public, max-age=300', // 5 min cache
    },
  });
}

// ── ICS builder ───────────────────────────────────────────────────────────────

function icsDate(iso: string) {
  // Convert ISO 8601 → iCal YYYYMMDDTHHMMSSZ
  return iso.replace(/[-:]/g, '').replace(/\.\d+/, '');
}

function icsText(s: string) {
  // Escape special chars per RFC 5545
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function buildIcs(
  tournamentName: string,
  matches: {
    id: string;
    court: number | null;
    scheduled_time: string;
    status: string;
    ea: { players: { full_name: string } | null } | null;
    eb: { players: { full_name: string } | null } | null;
    tc: { name: string } | null;
  }[],
  venue: string | null,
) {
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://playoffe.com';
  const now = icsDate(new Date().toISOString());

  const events = matches.map((m) => {
    const aName = m.ea?.players?.full_name ?? 'TBD';
    const bName = m.eb?.players?.full_name ?? 'TBD';
    const catName = m.tc?.name ?? '';
    const courtStr = m.court ? `Court ${m.court}` : '';
    const start = icsDate(m.scheduled_time);
    // Default match duration: 45 minutes
    const endDate = new Date(m.scheduled_time);
    endDate.setMinutes(endDate.getMinutes() + 45);
    const end = icsDate(endDate.toISOString());

    const summary = `${aName} vs ${bName}${catName ? ` — ${catName}` : ''}`;
    const location = [courtStr, venue].filter(Boolean).join(', ');

    return [
      'BEGIN:VEVENT',
      `UID:match-${m.id}@playoffe.com`,
      `DTSTAMP:${now}`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
      `SUMMARY:${icsText(summary)}`,
      location ? `LOCATION:${icsText(location)}` : '',
      `DESCRIPTION:${icsText(`${tournamentName} · ${catName}${courtStr ? ` · ${courtStr}` : ''}`)}`,
      `URL:${APP_URL}`,
      'END:VEVENT',
    ].filter(Boolean).join('\r\n');
  });

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//PLAYOFFE//Tournament Schedule//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsText(tournamentName)} Schedule`,
    'X-WR-TIMEZONE:UTC',
    ...events,
    'END:VCALENDAR',
  ].join('\r\n');
}
