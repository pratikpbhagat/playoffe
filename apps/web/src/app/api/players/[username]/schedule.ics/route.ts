import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { isUuid } from '@/lib/validate';

/**
 * GET /api/players/[username]/schedule.ics
 *
 * Returns an iCalendar (.ics) subscription for a player's upcoming matches
 * across all tournaments they're registered in.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ username: string }> },
) {
  const { username } = await params;
  const admin = createAdminClient();

  const { data: player } = await admin
    .from('players')
    .select('id, full_name')
    .eq('username', username)
    .single();

  if (!player) {
    return new NextResponse('Player not found', { status: 404 });
  }

  // Find all tournament_entries for this player
  const { data: entries } = await admin
    .from('tournament_entries')
    .select('id')
    .eq('player_id', player.id);

  // Validate before interpolating into the .or() filter string below —
  // see lib/validate.ts for why this matters even for server-derived IDs.
  const entryIds = (entries ?? []).map((e) => e.id).filter(isUuid);

  if (entryIds.length === 0) {
    // Return an empty but valid calendar
    return new NextResponse(emptyCalendar(player.full_name), {
      status: 200,
      headers: calendarHeaders(`${username}-schedule.ics`),
    });
  }

  // Fetch upcoming/in-progress matches where this player participates
  const { data: matches } = await admin
    .from('matches')
    .select(`
      id, court, scheduled_time, status,
      ea:tournament_entries!entry_a_id(id, players!player_id(full_name)),
      eb:tournament_entries!entry_b_id(id, players!player_id(full_name)),
      tc:tournament_categories!category_id(name),
      t:tournaments!tournament_id(name, slug, venue, status)
    `)
    .or(`entry_a_id.in.(${entryIds.map((id) => `"${id}"`).join(',')}),entry_b_id.in.(${entryIds.map((id) => `"${id}"`).join(',')})`)
    .not('scheduled_time', 'is', null)
    .in('status', ['scheduled', 'in_progress'])
    .order('scheduled_time');

  type MatchRow = {
    id: string;
    court: number | null;
    scheduled_time: string;
    status: string;
    ea: { id: string; players: { full_name: string } | null } | null;
    eb: { id: string; players: { full_name: string } | null } | null;
    tc: { name: string } | null;
    t: { name: string; slug: string; venue: string | null; status: string } | null;
  };

  // Drop matches belonging to draft tournaments — this feed is unauthenticated,
  // so it must never surface a tournament before it's actually made public.
  const rows = ((matches ?? []) as unknown as MatchRow[]).filter((m) => m.t?.status !== 'draft');
  const ics = buildPlayerIcs(player.full_name, rows);

  return new NextResponse(ics, {
    status: 200,
    headers: calendarHeaders(`${username}-schedule.ics`),
  });
}

function calendarHeaders(filename: string) {
  return {
    'Content-Type': 'text/calendar; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'public, max-age=300',
  };
}

function icsDate(iso: string) {
  return iso.replace(/[-:]/g, '').replace(/\.\d+/, '');
}

function icsText(s: string) {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function emptyCalendar(fullName: string) {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//PLAYOFFE//Player Schedule//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsText(fullName)} — PLAYOFFE Matches`,
    'X-WR-TIMEZONE:UTC',
    'END:VCALENDAR',
  ].join('\r\n');
}

function buildPlayerIcs(fullName: string, matches: {
  id: string;
  court: number | null;
  scheduled_time: string;
  ea: { id: string; players: { full_name: string } | null } | null;
  eb: { id: string; players: { full_name: string } | null } | null;
  tc: { name: string } | null;
  t: { name: string; slug: string; venue: string | null } | null;
}[]) {
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://playoffe.com';
  const now = icsDate(new Date().toISOString());

  const events = matches.map((m) => {
    const aName = m.ea?.players?.full_name ?? 'TBD';
    const bName = m.eb?.players?.full_name ?? 'TBD';
    const catName = m.tc?.name ?? '';
    const tournamentName = m.t?.name ?? '';
    const courtStr = m.court ? `Court ${m.court}` : '';
    const start = icsDate(m.scheduled_time);
    const endDate = new Date(m.scheduled_time);
    endDate.setMinutes(endDate.getMinutes() + 45);
    const end = icsDate(endDate.toISOString());
    const location = [courtStr, m.t?.venue].filter(Boolean).join(', ');
    const summary = `${aName} vs ${bName}${catName ? ` — ${catName}` : ''}`;

    return [
      'BEGIN:VEVENT',
      `UID:match-${m.id}@playoffe.com`,
      `DTSTAMP:${now}`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
      `SUMMARY:${icsText(summary)}`,
      location ? `LOCATION:${icsText(location)}` : '',
      `DESCRIPTION:${icsText(`${tournamentName} · ${catName}${courtStr ? ` · ${courtStr}` : ''}`)}`,
      `URL:${APP_URL}/events/${m.t?.slug ?? ''}`,
      'END:VEVENT',
    ].filter(Boolean).join('\r\n');
  });

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//PLAYOFFE//Player Schedule//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsText(fullName)} — PLAYOFFE Matches`,
    'X-WR-TIMEZONE:UTC',
    ...events,
    'END:VCALENDAR',
  ].join('\r\n');
}
