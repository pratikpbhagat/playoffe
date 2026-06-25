'use server';

import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient, createClient, getCurrentUser } from '@/lib/supabase/server';
import type { ScheduleUpdate } from './scheduling';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AIMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AIScheduleResponse {
  text: string;
  updates?: ScheduleUpdate[];
  conflictsDetected?: string[];
}

// ── Claude tool definition ────────────────────────────────────────────────────

const UPDATE_SCHEDULE_TOOL: Anthropic.Tool = {
  name: 'update_schedule',
  description:
    'Apply schedule changes to specified matches. Call this when you have a clear plan for how to schedule matches.',
  input_schema: {
    type: 'object' as const,
    properties: {
      reasoning: {
        type: 'string',
        description: 'Explain your scheduling decision concisely.',
      },
      updates: {
        type: 'array',
        description: 'List of match schedule assignments.',
        items: {
          type: 'object',
          properties: {
            match_id:       { type: 'string', description: 'The match UUID' },
            scheduled_time: { type: 'string', description: 'ISO 8601 UTC datetime (e.g. 2026-07-12T09:00:00.000Z)' },
            court:          { type: 'integer', minimum: 1, description: 'Court number (must be within availableCourts)' },
          },
          required: ['match_id', 'scheduled_time', 'court'],
        },
      },
      conflicts_detected: {
        type: 'array',
        items: { type: 'string' },
        description: 'Any scheduling conflicts in the proposed changes.',
      },
    },
    required: ['reasoning', 'updates'],
  },
};

// ── Main action ───────────────────────────────────────────────────────────────

/**
 * Calls Claude with the full tournament context and user message.
 * Returns the assistant's text response and any schedule updates proposed.
 *
 * Non-streaming (server action returning structured data) — the client
 * shows a loading state and renders the full response once received.
 * For very large schedules, consider upgrading to a streaming route handler.
 */
export async function callScheduleAssistantAction(params: {
  tournamentSlug: string;
  userMessage: string;
  conversationHistory: AIMessage[];
  currentSchedule: ScheduleUpdate[];
  availableCourts: number[];
  matchDurationMins: number;
}): Promise<AIScheduleResponse | { error: string }> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { error: 'AI assistant is not configured (ANTHROPIC_API_KEY missing)' };
  }

  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return { error: 'Not authenticated' };

  const admin = createAdminClient();

  // ── Fetch tournament context ──────────────────────────────────────────────
  const { data: t } = await admin
    .from('tournaments')
    .select('id, name, club_id, start_date, court_count, default_match_duration_mins, default_changeover_mins')
    .eq('slug', params.tournamentSlug)
    .single();
  if (!t) return { error: 'Tournament not found' };

  const { data: mgr } = await admin
    .from('club_managers')
    .select('role')
    .eq('club_id', (t as any).club_id)
    .eq('player_id', user.id)
    .maybeSingle();
  if (!mgr) return { error: 'Permission denied' };

  // ── Fetch all matches for context ─────────────────────────────────────────
  const { data: rawMatches } = await admin
    .from('matches')
    .select(`
      id, round, round_name, group_name, category_id, status,
      ea:tournament_entries!entry_a_id(players!player_id(full_name), partner:players!partner_id(full_name)),
      eb:tournament_entries!entry_b_id(players!player_id(full_name), partner:players!partner_id(full_name)),
      tc:tournament_categories!category_id(name)
    `)
    .eq('tournament_id', (t as any).id)
    .not('entry_a_id', 'is', null)
    .not('entry_b_id', 'is', null)
    .order('group_name', { ascending: true, nullsFirst: false })
    .order('round', { ascending: true });

  function buildName(e: any): string {
    const main = e?.players?.full_name;
    const partner = e?.partner?.full_name;
    if (!main) return 'TBD';
    return partner ? `${main} / ${partner}` : main;
  }

  const matchSummaries = (rawMatches ?? []).map((m: any) => {
    const scheduled = params.currentSchedule.find((s) => s.matchId === m.id);
    return {
      id:         m.id,
      category:   m.tc?.name ?? 'Unknown',
      group:      m.group_name ?? 'Knockout',
      round:      m.round_name ?? `Round ${m.round}`,
      player_a:   buildName(m.ea),
      player_b:   buildName(m.eb),
      status:     m.status,
      court:      scheduled?.court ?? null,
      time:       scheduled?.scheduledTime ?? null,
    };
  });

  const scheduledCount  = matchSummaries.filter((m) => m.time).length;
  const totalCount      = matchSummaries.length;
  const groupMatches    = matchSummaries.filter((m) => m.group !== 'Knockout');
  const knockoutMatches = matchSummaries.filter((m) => m.group === 'Knockout');

  // ── Build system prompt ───────────────────────────────────────────────────
  const systemPrompt = `You are an expert pickleball tournament scheduling assistant. Help organisers schedule matches quickly and efficiently.

TOURNAMENT: ${(t as any).name}
Start date: ${(t as any).start_date}
Available courts: ${params.availableCourts.join(', ')} (total ${params.availableCourts.length})
Match duration: ~${params.matchDurationMins} minutes per match
Changeover: ${(t as any).default_changeover_mins ?? 5} minutes between matches on the same court

CURRENT PROGRESS: ${scheduledCount}/${totalCount} matches scheduled

MATCH LIST (${totalCount} total):
${matchSummaries
  .map(
    (m) =>
      `[${m.id}] ${m.category} | ${m.group} | ${m.round} | ${m.player_a} vs ${m.player_b}` +
      (m.time ? ` → Court ${m.court} @ ${new Date(m.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ' (unscheduled)') +
      (m.status !== 'scheduled' ? ` [${m.status}]` : ''),
  )
  .join('\n')}

SCHEDULING RULES (CRITICAL — always follow these):
1. Each group's matches are played on ONE court, sequentially (Group A stays on court 1, etc.)
2. Different groups can run on different courts simultaneously
3. Knockout matches can only start AFTER all group-stage matches are finished
4. Never schedule two matches on the same court at overlapping times
5. Court numbers must be from: ${params.availableCourts.join(', ')}
6. Leave ~${(t as any).default_changeover_mins ?? 5} minutes between matches on the same court

When responding:
- First briefly explain your plan
- Then call the update_schedule tool with your proposed changes
- Flag any conflicts in the conflicts_detected field
- Use UTC ISO 8601 format for times (e.g. 2026-07-12T09:00:00.000Z)`;

  // ── Build conversation messages ───────────────────────────────────────────
  const messages: Anthropic.MessageParam[] = [
    ...params.conversationHistory.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user', content: params.userMessage },
  ];

  // ── Call Claude ───────────────────────────────────────────────────────────
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model:       'claude-sonnet-4-6',
    max_tokens:  4096,
    system:      systemPrompt,
    tools:       [UPDATE_SCHEDULE_TOOL],
    tool_choice: { type: 'auto' },
    messages,
  });

  // ── Extract text + tool use ───────────────────────────────────────────────
  let text             = '';
  let updates: ScheduleUpdate[] | undefined;
  let conflictsDetected: string[] | undefined;

  for (const block of response.content) {
    if (block.type === 'text') {
      text += block.text;
    } else if (block.type === 'tool_use' && block.name === 'update_schedule') {
      const input = block.input as {
        reasoning: string;
        updates: { match_id: string; scheduled_time: string; court: number }[];
        conflicts_detected?: string[];
      };

      if (!text) text = input.reasoning;

      updates = input.updates.map((u) => ({
        matchId:       u.match_id,
        scheduledTime: u.scheduled_time,
        court:         u.court,
      }));

      conflictsDetected = input.conflicts_detected;
    }
  }

  return { text, updates, conflictsDetected };
}
