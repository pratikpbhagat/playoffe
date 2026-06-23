import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient, getCurrentUser } from '@/lib/supabase/server';
import { buildSystemPrompt, type ClubContext } from '@/lib/wizard-system-prompt';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WizardMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface WizardPartialConfig {
  step: number;
  name: string | null;
  start_date: string | null;
  end_date: string | null;
  venue: string | null;
  courts: number | null;
  categories: Array<{
    name: string;
    format: string;
    draw_format: string;
    player_count: number;
    scoring: WizardScoring;
  }> | null;
  notes: string | null;
  player_uploads: Array<{ category: string; count: number }> | null;
  suggested_replies: string[] | null;
  suggested_categories: string[] | null;
}

export interface WizardScoring {
  scoring_format: 'rally' | 'traditional';
  points_per_set: number;
  sets_per_match: 1 | 3 | 5;
  win_by: 1 | 2;
  deuce_cap: number | null;
}

export interface WizardTournamentConfig {
  name: string;
  start_date: string;
  end_date: string;
  venue: string;
  courts: number;
  club_id: string;
  categories: Array<{
    name: string;
    gender: string;
    format: string;
    draw_format: string;
    player_count: number;
    scoring: WizardScoring;
    stage_scoring?: Array<
      Partial<WizardScoring> & { stage: 'group_stage' | 'knockout' | 'semifinal' | 'final' }
    >;
  }>;
  notes: string | null;
  created_via: string;
}

export interface WizardTurnResponse {
  reply: string;
  messages: WizardMessage[];
  partialConfig: WizardPartialConfig;
  tournamentCreated: boolean;
  tournamentSlug: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// emit_config tool — replaces the old ```config-state text block for reliable extraction
const EMIT_CONFIG_TOOL = {
  name: 'emit_config',
  description: 'Report the full current wizard configuration state. Call this at the end of every response, including the first greeting.',
  input_schema: {
    type: 'object' as const,
    properties: {
      step: { type: 'number', description: 'Current step number, 1-11' },
      name: { type: ['string', 'null'] },
      start_date: { type: ['string', 'null'] },
      end_date: { type: ['string', 'null'] },
      venue: { type: ['string', 'null'] },
      courts: { type: ['number', 'null'] },
      categories: {
        type: ['array', 'null'],
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            format: { type: 'string' },
            draw_format: { type: 'string' },
            player_count: { type: 'number' },
            scoring: {
              type: 'object',
              properties: {
                scoring_format: { type: 'string', enum: ['rally', 'traditional'] },
                points_per_set: { type: 'number' },
                sets_per_match: { type: 'number' },
                win_by: { type: 'number', enum: [1, 2], description: '1 = golden point, 2 = advantage/deuce' },
                deuce_cap: { type: ['number', 'null'], description: 'Only meaningful when win_by is 2. Score at which deuce switches to golden point.' },
              },
            },
          },
        },
      },
      notes: { type: ['string', 'null'] },
      player_uploads: {
        type: ['array', 'null'],
        items: {
          type: 'object',
          properties: {
            category: { type: 'string' },
            count: { type: 'number' },
          },
        },
      },
      suggested_replies: {
        type: ['array', 'null'],
        description: 'Up to 5 short, literal reply options the organizer can tap instead of typing. Only actionable choices — never restate the question, and never include an inline example you mentioned just in passing. Do NOT use this field for category name suggestions on Step 5 — use suggested_categories instead, even when there is no club history and you are offering generic defaults.',
        items: { type: 'string' },
      },
      suggested_categories: {
        type: ['array', 'null'],
        description: 'Step 5 only: the single field for any list of candidate category names the organizer could pick from or toggle — whether suggesting last time\'s categories, offering generic defaults when there is no club history, confirming a freshly parsed list, or re-confirming after an edit. List every category name here, every time, regardless of how you phrase it in your reply text (bullets, commas, etc). Never put category names in suggested_replies instead.',
        items: { type: 'string' },
      },
    },
    required: ['step'],
  },
};

function normalizeConfig(raw: Record<string, unknown>): WizardPartialConfig {
  // Normalise: Claude may still emit legacy "date" field instead of start_date/end_date
  return {
    step: (raw.step as number) ?? 1,
    name: (raw.name as string | null) ?? null,
    start_date: (raw.start_date as string | null) ?? (raw.date as string | null) ?? null,
    end_date: (raw.end_date as string | null) ?? (raw.date as string | null) ?? null,
    venue: (raw.venue as string | null) ?? null,
    courts: (raw.courts as number | null) ?? null,
    categories: (raw.categories as WizardPartialConfig['categories']) ?? null,
    notes: (raw.notes as string | null) ?? null,
    player_uploads: (raw.player_uploads as WizardPartialConfig['player_uploads']) ?? null,
    suggested_replies: normalizeStringList(raw.suggested_replies, 5, 60),
    suggested_categories: normalizeStringList(raw.suggested_categories, 12, 80),
  };
}

function normalizeStringList(raw: unknown, maxItems: number, maxLen: number): string[] | null {
  if (!Array.isArray(raw)) return null;
  const cleaned = raw
    .filter((s): s is string => typeof s === 'string')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length <= maxLen)
    .slice(0, maxItems);
  return cleaned.length > 0 ? cleaned : null;
}

function validatePartialConfig(config: WizardPartialConfig): string[] {
  const errors: string[] = [];
  if (config.courts !== null && (config.courts < 1 || config.courts > 20)) {
    errors.push(`courts out of range: ${config.courts}`);
  }
  if (config.start_date && !/^\d{4}-\d{2}-\d{2}$/.test(config.start_date)) {
    errors.push(`invalid start_date format: ${config.start_date}`);
  }
  if (config.end_date && !/^\d{4}-\d{2}-\d{2}$/.test(config.end_date)) {
    errors.push(`invalid end_date format: ${config.end_date}`);
  }
  if (config.categories) {
    for (const cat of config.categories) {
      if (!cat.name?.trim()) errors.push('category missing name');
      if (cat.scoring) {
        const { scoring_format, points_per_set, sets_per_match, win_by, deuce_cap } = cat.scoring;
        if (scoring_format && !['rally', 'traditional'].includes(scoring_format)) {
          errors.push(`invalid scoring_format: ${scoring_format}`);
        }
        if (points_per_set != null && (points_per_set < 5 || points_per_set > 100)) {
          errors.push(`points_per_set out of range: ${points_per_set}`);
        }
        if (sets_per_match != null && ![1, 3, 5].includes(sets_per_match)) {
          errors.push(`invalid sets_per_match: ${sets_per_match}`);
        }
        if (win_by != null && ![1, 2].includes(win_by)) {
          errors.push(`invalid win_by: ${win_by}`);
        }
        if (deuce_cap != null && deuce_cap < 5) {
          errors.push(`deuce_cap too low: ${deuce_cap}`);
        }
      }
    }
  }
  return errors;
}

function extractTournamentConfig(text: string): { clean: string; config: WizardTournamentConfig | null } {
  const re = /```json\s*(\{[\s\S]*?"TOURNAMENT_CONFIG"[\s\S]*?\})\s*```/;
  const match = text.match(re);
  if (!match) return { clean: text, config: null };

  const clean = text.replace(re, '').trimEnd();
  try {
    const parsed = JSON.parse(match[1]) as { TOURNAMENT_CONFIG: WizardTournamentConfig };
    return { clean, config: parsed.TOURNAMENT_CONFIG ?? null };
  } catch {
    return { clean, config: null };
  }
}

// ── Play format mapping ───────────────────────────────────────────────────────

function toPlayFormat(format: string): 'singles' | 'doubles' | 'mixed_doubles' {
  const f = format.toLowerCase();
  if (f.includes('mixed')) return 'mixed_doubles';
  if (f.includes('double')) return 'doubles';
  return 'singles';
}

function toDrawFormat(
  format: string,
): 'round_robin' | 'single_elimination' | 'double_elimination' | 'group_stage_knockout' | 'swiss' {
  const f = format.toLowerCase();
  if (f.includes('group') || f.includes('knockout')) return 'group_stage_knockout';
  if (f.includes('double')) return 'double_elimination';
  if (f.includes('single') || f.includes('elimination')) return 'single_elimination';
  if (f.includes('swiss')) return 'swiss';
  return 'round_robin';
}

function toCategoryType(
  catName: string,
  gender: string,
): 'skill' | 'age' | 'gender' | 'open' {
  const n = catName.toLowerCase();
  const g = gender.toLowerCase();
  if (n.includes(' a') || n.includes(' b') || n.includes(' c') || n.includes('beginner')) {
    return 'skill';
  }
  if (g === 'open' || n.includes('open')) return 'open';
  return 'gender';
}

// ── Club context fetcher ──────────────────────────────────────────────────────

async function fetchClubContext(clubId: string): Promise<ClubContext> {
  const admin = createAdminClient();

  const [clubRes, pastTournamentsRes, allNamesRes] = await Promise.all([
    admin.from('clubs').select('name').eq('id', clubId).single(),
    admin
      .from('tournaments')
      .select('id, venue, scoring_format, num_sets, points_per_set, win_by, deuce_cap, tournament_categories(name, draw_format)')
      .eq('club_id', clubId)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(10),
    admin
      .from('tournaments')
      .select('name')
      .eq('club_id', clubId)
      .order('created_at', { ascending: false }),
  ]);

  const clubName = (clubRes.data as { name: string } | null)?.name ?? 'Your Club';
  const past = pastTournamentsRes.data ?? [];

  // Past venues (distinct, most recent first)
  const venuesSeen = new Set<string>();
  const pastVenues: string[] = [];
  for (const t of past) {
    const v = (t as { venue?: string | null }).venue;
    if (v && !venuesSeen.has(v)) {
      venuesSeen.add(v);
      pastVenues.push(v);
      if (pastVenues.length >= 5) break;
    }
  }

  // Most common draw format
  const formatCounts = new Map<string, number>();
  for (const t of past) {
    for (const cat of ((t as { tournament_categories?: Array<{ draw_format: string }> }).tournament_categories ?? [])) {
      formatCounts.set(cat.draw_format, (formatCounts.get(cat.draw_format) ?? 0) + 1);
    }
  }
  const topFormat = [...formatCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const formatLabels: Record<string, string> = {
    round_robin: 'Round Robin',
    single_elimination: 'Single Elimination',
    double_elimination: 'Double Elimination',
    group_stage_knockout: 'Group Stage + Knockout',
    swiss: 'Swiss',
  };
  const mostCommonFormat = topFormat ? (formatLabels[topFormat] ?? topFormat) : '';

  // Most common scoring
  let mostCommonScoring = '';
  if (past.length > 0) {
    const t = past[0] as {
      scoring_format?: string | null;
      num_sets?: number | null;
      points_per_set?: number | null;
      win_by?: number | null;
      deuce_cap?: number | null;
    };
    if (t.num_sets && t.points_per_set) {
      const formatLabel = t.scoring_format === 'traditional' ? 'traditional service-point scoring' : 'rally scoring';
      const endRule = t.win_by === 1 ? 'golden point' : t.deuce_cap ? `deuce, capped at ${t.deuce_cap}` : 'deuce, no cap';
      mostCommonScoring = `${formatLabel}, ${t.points_per_set} points per set, best of ${t.num_sets}, ${endRule}`;
    }
  }

  // Most common categories
  const catCounts = new Map<string, number>();
  for (const t of past) {
    for (const cat of ((t as { tournament_categories?: Array<{ name: string }> }).tournament_categories ?? [])) {
      catCounts.set(cat.name, (catCounts.get(cat.name) ?? 0) + 1);
    }
  }
  const topCats = [...catCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name]) => name);
  const mostCommonCategories = topCats.length > 0 ? topCats.join(', ') : '';

  return {
    clubName,
    clubId,
    pastVenues,
    mostCommonFormat,
    mostCommonScoring,
    mostCommonCategories,
    todayDate: new Date().toLocaleDateString('en-GB', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
    existingTournamentNames: (allNamesRes.data ?? []).map(
      (t) => (t as { name: string }).name,
    ),
  };
}

// ── Tournament creation from wizard config ────────────────────────────────────

async function createTournamentFromConfig(
  config: WizardTournamentConfig,
  userId: string,
): Promise<{ slug: string } | { error: string }> {
  const admin = createAdminClient();

  // Verify the user manages this club
  const { data: mgr } = await admin
    .from('club_managers')
    .select('role')
    .eq('club_id', config.club_id)
    .eq('player_id', userId)
    .maybeSingle();

  if (!mgr) return { error: 'Permission denied' };

  const { data: tournament, error: tErr } = await admin
    .from('tournaments')
    .insert({
      club_id: config.club_id,
      name: config.name,
      venue: config.venue,
      start_date: config.start_date,
      end_date: config.end_date,
      court_count: config.courts,
      status: 'draft',
      scoring_format: config.categories[0]?.scoring.scoring_format ?? 'rally',
      num_sets: config.categories[0]?.scoring.sets_per_match ?? 3,
      points_per_set: config.categories[0]?.scoring.points_per_set ?? 11,
      win_by: config.categories[0]?.scoring.win_by ?? 2,
      deuce_cap: config.categories[0]?.scoring.deuce_cap ?? null,
      created_by: userId,
      display_code: '',
      slug: '',
    })
    .select('id, slug')
    .single();

  if (tErr || !tournament) return { error: 'Failed to create tournament' };

  // Create categories
  const categoryRows = config.categories.map((cat) => ({
    tournament_id: tournament.id,
    slug: '',
    name: cat.name,
    type: toCategoryType(cat.name, cat.gender),
    play_format: toPlayFormat(cat.format),
    draw_format: toDrawFormat(cat.draw_format),
    status: 'pending',
    max_entries: cat.player_count > 0 ? cat.player_count : null,
    scoring_override: true,
    scoring_format: cat.scoring.scoring_format,
    num_sets: cat.scoring.sets_per_match,
    points_per_set: cat.scoring.points_per_set,
    win_by: cat.scoring.win_by,
    deuce_cap: cat.scoring.deuce_cap ?? null,
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: createdCats, error: catErr } = await (admin as any)
    .from('tournament_categories')
    .insert(categoryRows)
    .select('id, name');

  if (catErr) {
    console.error('Failed to create wizard categories:', catErr);
    return { slug: (tournament as { slug: string }).slug };
  }

  // Create per-stage scoring overrides for each category
  const stageScoringRows: Array<{
    category_id: string;
    stage: string;
    points_per_set?: number;
    num_sets?: number;
    win_by?: number;
    deuce_cap?: number | null;
  }> = [];

  for (const cat of config.categories) {
    if (!cat.stage_scoring?.length) continue;
    const created = (createdCats as Array<{ id: string; name: string }>).find(
      (c) => c.name === cat.name,
    );
    if (!created) continue;
    for (const ss of cat.stage_scoring) {
      stageScoringRows.push({
        category_id: created.id,
        stage: ss.stage,
        ...(ss.points_per_set != null ? { points_per_set: ss.points_per_set } : {}),
        ...(ss.sets_per_match != null ? { num_sets: ss.sets_per_match } : {}),
        ...(ss.win_by != null ? { win_by: ss.win_by } : {}),
        ...(ss.deuce_cap !== undefined ? { deuce_cap: ss.deuce_cap } : {}),
      });
    }
  }

  if (stageScoringRows.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: ssErr } = await (admin as any)
      .from('category_stage_scoring')
      .insert(stageScoringRows);
    if (ssErr) console.error('Failed to create stage scoring overrides:', ssErr);
  }

  return { slug: (tournament as { slug: string }).slug };
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'AI wizard is not configured. Add ANTHROPIC_API_KEY to your environment.' }, { status: 503 });
  }

  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const body = (await req.json()) as {
      clubId: string;
      messages: WizardMessage[];
      userMessage: string;
      currentStep?: number;
    };

    const { clubId, messages, userMessage, currentStep = 1 } = body;
    if (!clubId) return NextResponse.json({ error: 'clubId required' }, { status: 400 });

    // Verify the user manages this club
    const admin = createAdminClient();
    const { data: mgr } = await admin
      .from('club_managers')
      .select('role')
      .eq('club_id', clubId)
      .eq('player_id', user.id)
      .maybeSingle();

    if (!mgr) return NextResponse.json({ error: 'Permission denied — you are not a manager of this club.' }, { status: 403 });

    // Fetch club context and build system prompt
    const ctx = await fetchClubContext(clubId);
    const systemPrompt = buildSystemPrompt(ctx);

    // Build conversation — send the full history. Confirmed answers (name, date, venue, etc.)
    // live only in this message history, not in any separate persisted store, so trimming it
    // would make Claude forget facts the organizer already confirmed.
    const updatedMessages: WizardMessage[] = [
      ...messages,
      { role: 'user', content: userMessage },
    ];

    // Call Claude with prompt caching on the system prompt
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    // Extended thinking on the final confirmation step only — the highest-stakes turn,
    // where Claude assembles the full config and emits the create-tournament JSON.
    const isConfirmationStep = currentStep === 11;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: isConfirmationStep ? 4096 : 1024,
      // Extended thinking requires temperature 1 (the default) — only set temperature otherwise.
      ...(isConfirmationStep
        ? { thinking: { type: 'enabled', budget_tokens: 2000 } }
        : { temperature: 0.3 }),
      system: [
        {
          type: 'text',
          text: systemPrompt,
          // @ts-expect-error cache_control is supported but not yet in SDK types
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: updatedMessages.map((m) => ({ role: m.role, content: m.content })),
      tools: [EMIT_CONFIG_TOOL],
      tool_choice: { type: 'auto' },
    });

    const textBlock = response.content.find((b) => b.type === 'text');
    const rawReply = textBlock?.type === 'text' ? textBlock.text : '';

    const toolUseBlock = response.content.find(
      (b) => b.type === 'tool_use' && b.name === 'emit_config',
    );
    const partialConfig =
      toolUseBlock?.type === 'tool_use'
        ? normalizeConfig(toolUseBlock.input as Record<string, unknown>)
        : null;

    if (partialConfig) {
      const validationErrors = validatePartialConfig(partialConfig);
      if (validationErrors.length > 0) {
        console.warn('[wizard/turn] config validation errors:', validationErrors);
      }
    }

    // Check if this response contains the final TOURNAMENT_CONFIG — strip the raw JSON block
    // from what's shown to the organizer either way; it's an implementation detail, not
    // something they need to read.
    const { clean: displayReply, config: tournamentConfig } = extractTournamentConfig(rawReply);

    let tournamentCreated = false;
    let tournamentSlug: string | null = null;

    if (tournamentConfig) {
      const result = await createTournamentFromConfig(tournamentConfig, user.id);
      if ('slug' in result) {
        tournamentCreated = true;
        tournamentSlug = result.slug;
      }
    }

    const finalMessages: WizardMessage[] = [
      ...updatedMessages,
      { role: 'assistant', content: displayReply },
    ];

    const defaultConfig: WizardPartialConfig = {
      step: 1,
      name: null,
      start_date: null,
      end_date: null,
      venue: null,
      courts: null,
      categories: null,
      notes: null,
      player_uploads: null,
      suggested_replies: null,
      suggested_categories: null,
    };

    return NextResponse.json({
      reply: displayReply,
      messages: finalMessages,
      partialConfig: partialConfig ?? defaultConfig,
      tournamentCreated,
      tournamentSlug,
    } satisfies WizardTurnResponse);

  } catch (err) {
    console.error('[wizard/turn] unhandled error:', err);
    const message = err instanceof Error ? err.message : 'An unexpected error occurred';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
