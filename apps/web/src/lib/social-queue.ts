// Web-app side BullMQ producer for the social posting pipeline.
//
// Imports ONLY from bullmq — BullMQ owns its own IORedis connection internally.
// This avoids the ioredis version conflict that can arise when the web app and
// workers resolve different patch versions of ioredis.
//
// Uses a module-level singleton Queue so the Redis connection is not
// re-created on every server action invocation.

import { Queue } from 'bullmq';

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
      // Required by BullMQ for blocking commands
      maxRetriesPerRequest: null as null,
    };
  } catch {
    return { host: 'localhost', port: 6379, maxRetriesPerRequest: null as null };
  }
}

// ── Singleton Queue ───────────────────────────────────────────────────────────
// Stored on globalThis so Next.js HMR does not create a new connection on
// every hot-reload cycle during development.
const g = globalThis as typeof globalThis & {
  __graphicQueue?: Queue;
};

function getGraphicQueue(): Queue {
  if (!g.__graphicQueue) {
    const connection = parseRedisConnection(
      process.env.REDIS_URL ?? 'redis://localhost:6379',
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    g.__graphicQueue = new Queue('social.graphic', { connection: connection as any });
  }
  return g.__graphicQueue;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Enqueue a social graphic job for the winner of a completed match.
 * Fire-and-forget — caller should NOT await this.
 *
 * If Redis is unavailable or REDIS_URL is not set, the error is caught
 * and logged; it never propagates to the scoring action.
 */
export async function enqueueMatchWinGraphic(params: {
  winnerPlayerId: string;
  winnerEntryId: string;
  matchId: string;
  categoryId: string;
  tournamentId: string;
}): Promise<void> {
  // Social posting is opt-in — skip if Redis is not configured
  if (!process.env.REDIS_URL) return;

  try {
    const queue = getGraphicQueue();
    const jobData: GraphicJobData = {
      triggerType: 'match_win',
      playerId: params.winnerPlayerId,
      entryId:  params.winnerEntryId,
      matchId:  params.matchId,
      categoryId:   params.categoryId,
      tournamentId: params.tournamentId,
    };

    await queue.add(`match-win-${params.matchId}`, jobData, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 3000 },
      // Deduplicate: identical jobId means "already queued, skip"
      jobId: `match-win-${params.matchId}-${params.winnerPlayerId}`,
    });
  } catch (err) {
    // Non-critical: log but never block the scoring action
    console.error('[social-queue] Failed to enqueue match-win graphic job:', err);
  }
}
