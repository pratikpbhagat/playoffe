// Graphic Worker — processes social:graphic queue jobs.
//
// For each job:
//  1. Fetch match / category / tournament data from Supabase
//  2. Determine which platforms the player has enabled for this trigger
//  3. Generate caption (template or Claude AI)
//  4. Render graphic with Satori + @resvg/resvg-js
//  5. Upload PNG to Supabase Storage
//  6. For each platform:
//     a. Insert a row into social_post_log (status = 'pending_preview' | 'posting')
//     b. If preview_before_post → stop here (user must approve from app)
//     c. Otherwise → enqueue a social:post job

import { Worker } from 'bullmq';
import { connection, QUEUE_NAMES, postQueue } from '../queue.js';
import type { GraphicJobData, PostJobData, TriggerType } from '../queue.js';
import { supabase, uploadGraphic } from '../lib/supabase.js';
import { renderMatchWin, renderCategoryComplete } from '../lib/graphic.js';
import { generateCaption } from '../lib/caption.js';
import type { CaptionStyle, CaptionContext } from '../lib/caption.js';

const CONCURRENCY = parseInt(process.env.GRAPHIC_WORKER_CONCURRENCY ?? '5', 10);

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PlatformPrefs {
  enabled?: boolean;
  triggers?: Record<string, boolean>;
  caption_style?: string;
  custom_template?: string;
  preview_before_post?: boolean;
}

export interface SocialPrefs {
  paused?: boolean;
  platforms?: Record<string, PlatformPrefs>;
}

export interface GraphicJobResult {
  skipped?: boolean;
  error?: string;
  done?: boolean;
  platforms?: number;
  graphicUrl?: string;
  /** post_log IDs created — populated when skipEnqueue=true so tests can pass them directly to processPostJob */
  postLogIds?: { id: string; platform: string }[];
}

// ── Exported processor (called directly in tests) ─────────────────────────────

export async function processGraphicJob(
  data: GraphicJobData,
  jobId = 'direct',
  /** When true, skips BullMQ postQueue.add — used by tests to avoid racing background workers */
  skipEnqueue = false,
): Promise<GraphicJobResult> {
  const { triggerType, playerId, matchId, categoryId, tournamentId } = data;
  console.log(`[graphic] Job ${jobId}: ${triggerType} for player ${playerId}`);

  // ── 1. Fetch player social config ──────────────────────────────────────────
  const [{ data: connections }, { data: profile }] = await Promise.all([
    supabase
      .from('social_connections' as 'social_connections')
      .select('platform, is_active')
      .eq('player_id', playerId)
      .eq('is_active', true),
    supabase
      .from('player_profiles')
      .select('social_post_prefs')
      .eq('player_id', playerId)
      .maybeSingle(),
  ]);

  const prefs = (profile as { social_post_prefs?: SocialPrefs } | null)
    ?.social_post_prefs;

  if (!prefs || prefs.paused) {
    console.log(`[graphic] Job ${jobId}: social posting paused or no prefs — skipping`);
    return { skipped: true };
  }

  const connectedPlatforms = new Set(
    (connections ?? []).map((c) => (c as { platform: string }).platform),
  );

  // Determine which platforms are active for this trigger
  const platformsToPost = Object.entries(prefs.platforms ?? {})
    .filter(([platform, cfg]) => {
      if (!cfg.enabled) return false;
      if (!(cfg.triggers ?? {})[triggerType]) return false;
      if (platform !== 'whatsapp' && !connectedPlatforms.has(platform)) return false;
      return true;
    })
    .map(([platform, cfg]) => ({ platform, cfg }));

  if (platformsToPost.length === 0) {
    console.log(`[graphic] Job ${jobId}: no platforms enabled for ${triggerType} — skipping`);
    return { skipped: true };
  }

  // ── 2. Fetch render data ───────────────────────────────────────────────────
  const ctx = await fetchRenderContext({ triggerType, matchId, categoryId, tournamentId, playerId });
  if (!ctx) {
    console.error(`[graphic] Job ${jobId}: could not build render context`);
    return { error: 'Missing render context' };
  }

  // ── 3. Render graphic ──────────────────────────────────────────────────────
  let pngBuffer: Buffer;
  try {
    pngBuffer = triggerType === 'match_win'
      ? await renderMatchWin({
          playerName:     ctx.playerName,
          opponentName:   ctx.opponentName ?? 'Opponent',
          score:          ctx.score ?? '',
          tournamentName: ctx.tournamentName,
          categoryName:   ctx.categoryName,
          platform:       'generic',
        })
      : await renderCategoryComplete({ ...ctx, platform: 'generic' });
  } catch (err) {
    console.error(`[graphic] Job ${jobId}: render failed:`, err);
    throw err;
  }

  // ── 4. Upload to Supabase Storage ──────────────────────────────────────────
  const fileName = `${playerId}/${triggerType}-${Date.now()}.png`;
  let graphicUrl: string;
  try {
    graphicUrl = await uploadGraphic(fileName, pngBuffer);
    console.log(`[graphic] Job ${jobId}: uploaded → ${graphicUrl}`);
  } catch (err) {
    console.error(`[graphic] Job ${jobId}: upload failed:`, err);
    throw err;
  }

  // ── 5. Per-platform: caption → log row → preview or post job ──────────────
  const autoPostLogIds: { id: string; platform: string }[] = [];

  const captionCtx: CaptionContext = {
    triggerType: triggerType as TriggerType,
    playerName:     ctx.playerName,
    opponentName:   ctx.opponentName,
    score:          ctx.score,
    tournamentName: ctx.tournamentName,
    categoryName:   ctx.categoryName,
  };

  for (const { platform, cfg } of platformsToPost) {
    if (platform === 'whatsapp') continue; // share-link only — no server-side post

    const captionStyle = (cfg.caption_style ?? 'humble') as CaptionStyle;
    let caption: string;
    try {
      caption = await generateCaption(captionStyle, {
        ...captionCtx,
        ...(captionStyle === 'custom' && cfg.custom_template
          ? { customTemplate: cfg.custom_template }
          : {}),
      });
    } catch {
      caption = `${triggerType === 'match_win' ? '🏆 Match win' : '🎯 Category complete'} at ${ctx.tournamentName}! #pickleball`;
    }

    const isPreview = cfg.preview_before_post ?? true;
    const initialStatus = isPreview ? 'pending_preview' : 'posting';

    // Insert post log row
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: logRow } = await supabase
      .from('social_post_log' as any)
      .insert({
        player_id:    playerId,
        platform,
        trigger_type: triggerType,
        trigger_id:   matchId ?? categoryId ?? tournamentId,
        tournament_id: tournamentId,
        caption,
        caption_style: captionStyle,
        graphic_url:  graphicUrl,
        status:       initialStatus,
        generated_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (!logRow) continue;
    const postLogId = (logRow as { id: string }).id;

    if (isPreview) {
      // TODO (Phase 11C): send preview push notification via web-push / SNS
      console.log(`[graphic] Job ${jobId}: preview pending for ${platform}, log ${postLogId}`);
    } else if (!skipEnqueue) {
      const postJobData: PostJobData = {
        postLogId,
        playerId,
        platform: platform as 'instagram' | 'facebook' | 'x',
        graphicUrl,
        caption,
        triggerType,
      };
      await postQueue.add(`${platform}-${postLogId}`, postJobData, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      });
      console.log(`[graphic] Job ${jobId}: post job enqueued for ${platform}`);
    } else {
      autoPostLogIds.push({ id: postLogId, platform });
      console.log(`[graphic] Job ${jobId}: auto-post ready for ${platform}, log ${postLogId} (test mode — skipEnqueue)`);
    }
  }

  return {
    done:        true,
    platforms:   platformsToPost.length,
    graphicUrl,
    postLogIds:  autoPostLogIds.length > 0 ? autoPostLogIds : undefined,
  };
}

// ── BullMQ Worker (production) ─────────────────────────────────────────────────

export function startGraphicWorker() {
  const worker = new Worker<GraphicJobData>(
    QUEUE_NAMES.GRAPHIC,
    (job) => processGraphicJob(job.data, job.id),
    { connection, concurrency: CONCURRENCY },
  );

  worker.on('failed', (job, err) => {
    console.error(`[graphic] Job ${job?.id} failed:`, err.message);
  });

  console.log(`[graphic] Worker started (concurrency ${CONCURRENCY})`);
  return worker;
}

// ── Render context builder ─────────────────────────────────────────────────────

interface RenderContext {
  playerName: string;
  opponentName?: string;
  score?: string;
  tournamentName: string;
  categoryName: string;
  position?: number;
}

async function fetchRenderContext(params: {
  triggerType: string;
  matchId?: string;
  categoryId: string;
  tournamentId: string;
  playerId: string;
}): Promise<RenderContext | null> {
  const { triggerType, matchId, categoryId, tournamentId, playerId } = params;

  const [{ data: tournament }, { data: category }] = await Promise.all([
    supabase.from('tournaments').select('name').eq('id', tournamentId).maybeSingle(),
    supabase.from('tournament_categories').select('name').eq('id', categoryId).maybeSingle(),
  ]);

  const tournamentName = (tournament as { name: string } | null)?.name ?? 'Tournament';
  const categoryName   = (category as { name: string } | null)?.name ?? 'Category';

  const { data: player } = await supabase
    .from('players')
    .select('full_name')
    .eq('id', playerId)
    .maybeSingle();
  const playerName = (player as { full_name: string } | null)?.full_name ?? 'Player';

  if (triggerType === 'match_win' && matchId) {
    const { data: match } = await supabase
      .from('matches')
      .select('sets, entry_a_id, entry_b_id, winner_entry_id')
      .eq('id', matchId)
      .maybeSingle();

    if (!match) return { playerName, tournamentName, categoryName };

    const m = match as { sets: unknown; entry_a_id: string; entry_b_id: string; winner_entry_id: string };
    const opponentEntryId = m.winner_entry_id === m.entry_a_id ? m.entry_b_id : m.entry_a_id;

    const { data: opponentEntry } = await supabase
      .from('tournament_entries')
      .select('player_id')
      .eq('id', opponentEntryId)
      .maybeSingle();

    let opponentName = 'Opponent';
    if (opponentEntry) {
      const { data: op } = await supabase
        .from('players')
        .select('full_name')
        .eq('id', (opponentEntry as { player_id: string }).player_id)
        .maybeSingle();
      opponentName = (op as { full_name: string } | null)?.full_name ?? 'Opponent';
    }

    const sets = Array.isArray(m.sets) ? m.sets as { score_a: number; score_b: number }[] : [];
    const score = sets.map((s) => `${s.score_a}-${s.score_b}`).join(', ');

    return { playerName, opponentName, score, tournamentName, categoryName };
  }

  return { playerName, tournamentName, categoryName };
}
