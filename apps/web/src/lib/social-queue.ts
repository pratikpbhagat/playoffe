// Web-app side BullMQ producers for the social posting pipeline.
//
// Imports ONLY from bullmq — BullMQ owns its own IORedis connection internally.
// This avoids the ioredis version conflict that can arise when the web app and
// workers resolve different patch versions of ioredis.
//
// Uses module-level singleton Queues so the Redis connection is not
// re-created on every server action invocation.

import { Queue } from 'bullmq';
import { createAdminClient } from '@/lib/supabase/server';
import { isFeatureEnabled } from '@/lib/features';

// ── Job data types (mirrored from workers/src/queue.ts) ───────────────────────
export type TriggerType = 'match_win' | 'category_complete' | 'tournament_complete';

export interface GraphicJobData {
  triggerType: TriggerType;
  playerId: string;
  entryId: string;
  matchId?: string;
  categoryId: string;
  tournamentId: string;
}

export interface PostJobData {
  postLogId: string;
  playerId: string;
  platform: 'instagram' | 'facebook' | 'x';
  graphicUrl: string;
  caption: string;
  triggerType: TriggerType;
}

// ── Parse a Redis URL into BullMQ-compatible connection options ───────────────
function parseRedisConnection(url: string) {
  try {
    const u = new URL(url);
    return {
      host: u.hostname || 'localhost',
      port: parseInt(u.port || '6379', 10),
      password: u.password || undefined,
      username: u.username || undefined,
      tls: u.protocol === 'rediss:' ? ({} as object) : undefined,
      maxRetriesPerRequest: null as null,
    };
  } catch {
    return { host: 'localhost', port: 6379, maxRetriesPerRequest: null as null };
  }
}

// ── Singleton Queues ──────────────────────────────────────────────────────────
const g = globalThis as typeof globalThis & {
  __graphicQueue?: Queue;
  __postQueue?: Queue;
  __podiumQueue?: Queue;
};

export function getPodiumQueue(): Queue {
  if (!g.__podiumQueue) {
    const connection = parseRedisConnection(process.env.REDIS_URL ?? 'redis://localhost:6379');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    g.__podiumQueue = new Queue('social.podium', { connection: connection as any });
  }
  return g.__podiumQueue;
}

export function getGraphicQueue(): Queue {
  if (!g.__graphicQueue) {
    const connection = parseRedisConnection(process.env.REDIS_URL ?? 'redis://localhost:6379');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    g.__graphicQueue = new Queue('social.graphic', { connection: connection as any });
  }
  return g.__graphicQueue;
}

export function getPostQueue(): Queue {
  if (!g.__postQueue) {
    const connection = parseRedisConnection(process.env.REDIS_URL ?? 'redis://localhost:6379');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    g.__postQueue = new Queue('social.post', { connection: connection as any });
  }
  return g.__postQueue;
}

// ── Shared enqueue helper ────────────────────────────────────────────────────

async function enqueueGraphicJob(
  jobName: string,
  jobId: string,
  data: GraphicJobData,
): Promise<void> {
  if (!process.env.REDIS_URL) return;
  // Gate player jobs behind social_media_player flag
  const playerEnabled = await isFeatureEnabled('social_media_player');
  if (!playerEnabled) return;
  try {
    const queue = getGraphicQueue();
    await queue.add(jobName, data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 3000 },
      jobId,
    });
  } catch (err) {
    console.error(`[social-queue] Failed to enqueue ${data.triggerType} job:`, err);
  }
}

async function enqueuePodiumJob(
  jobName: string,
  jobId: string,
  data: {
    type: 'podium' | 'wrap_up' | 'draw_published' | 'schedule_released';
    categoryId?: string;
    tournamentId: string;
    clubId: string;
    categoryName?: string;
    participantCount?: number;
    drawFormat?: string;
    matchCount?: number;
  },
): Promise<void> {
  if (!process.env.REDIS_URL) return;
  // Gate organiser jobs behind social_media_organiser flag
  const organiserEnabled = await isFeatureEnabled('social_media_organiser');
  if (!organiserEnabled) return;
  try {
    const queue = getPodiumQueue();
    await queue.add(jobName, data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      jobId,
    });
  } catch (err) {
    console.error(`[social-queue] Failed to enqueue ${data.type} organiser job:`, err);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Enqueue a match_win graphic job for the winner of a completed match.
 * Fire-and-forget — caller should NOT await this.
 */
export async function enqueueMatchWinGraphic(params: {
  winnerPlayerId: string;
  winnerEntryId: string;
  matchId: string;
  categoryId: string;
  tournamentId: string;
}): Promise<void> {
  await enqueueGraphicJob(
    `match-win-${params.matchId}`,
    `match-win-${params.matchId}-${params.winnerPlayerId}`,
    {
      triggerType:  'match_win',
      playerId:     params.winnerPlayerId,
      entryId:      params.winnerEntryId,
      matchId:      params.matchId,
      categoryId:   params.categoryId,
      tournamentId: params.tournamentId,
    },
  );
}

/**
 * Enqueue a category_complete graphic job for a single player.
 * Fire-and-forget — caller should NOT await this.
 */
export async function enqueueCategoryCompleteGraphic(params: {
  playerId: string;
  entryId: string;
  categoryId: string;
  tournamentId: string;
}): Promise<void> {
  await enqueueGraphicJob(
    `cat-complete-${params.categoryId}-${params.playerId}`,
    `cat-complete-${params.categoryId}-${params.playerId}`,
    {
      triggerType:  'category_complete',
      playerId:     params.playerId,
      entryId:      params.entryId,
      categoryId:   params.categoryId,
      tournamentId: params.tournamentId,
    },
  );
}

/**
 * Enqueue a draw_published organiser post for a club.
 * Called when the tournament manager clicks "Share draw on social".
 */
export async function enqueueDrawPublished(params: {
  tournamentId: string;
  clubId: string;
  categoryId: string;
  categoryName: string;
  participantCount: number;
  drawFormat: string;
}): Promise<void> {
  await enqueuePodiumJob(
    `draw-published-${params.categoryId}`,
    `draw-published-${params.categoryId}`,
    {
      type:             'draw_published',
      tournamentId:     params.tournamentId,
      clubId:           params.clubId,
      categoryId:       params.categoryId,
      categoryName:     params.categoryName,
      participantCount: params.participantCount,
      drawFormat:       params.drawFormat,
    },
  );
}

/**
 * Enqueue a schedule_released organiser post for a club.
 * Called when the tournament manager clicks "Share schedule on social".
 */
export async function enqueueScheduleReleased(params: {
  tournamentId: string;
  clubId: string;
  matchCount: number;
}): Promise<void> {
  await enqueuePodiumJob(
    `schedule-released-${params.tournamentId}`,
    `schedule-released-${params.tournamentId}`,
    {
      type:         'schedule_released',
      tournamentId: params.tournamentId,
      clubId:       params.clubId,
      matchCount:   params.matchCount,
    },
  );
}

/**
 * Enqueue tournament_complete graphic jobs for ALL active participants
 * in a tournament. One job per player, fire-and-forget.
 */
export async function enqueueTournamentCompleteGraphics(params: {
  tournamentId: string;
}): Promise<void> {
  if (!process.env.REDIS_URL) return;

  try {
    const admin = createAdminClient();
    // Fetch all active entries for the tournament
    const { data: entries } = await admin
      .from('tournament_entries')
      .select('id, player_id, category_id')
      .eq('tournament_id', params.tournamentId)
      .eq('status', 'active');

    if (!entries || entries.length === 0) return;

    // Enqueue one job per (player, category) pair — avoids multiple jobs
    // for doubles players who appear in more than one category
    const seen = new Set<string>();
    for (const entry of entries) {
      const key = `${entry.player_id}-${entry.category_id}`;
      if (seen.has(key)) continue;
      seen.add(key);

      void enqueueGraphicJob(
        `tournament-complete-${params.tournamentId}-${entry.player_id}`,
        `tournament-complete-${params.tournamentId}-${entry.player_id}`,
        {
          triggerType:  'tournament_complete',
          playerId:     entry.player_id,
          entryId:      entry.id,
          categoryId:   entry.category_id,
          tournamentId: params.tournamentId,
        },
      );
    }
  } catch (err) {
    console.error('[social-queue] Failed to enqueue tournament_complete jobs:', err);
  }
}
