import 'dotenv/config';
import { Queue } from 'bullmq';
import { Redis as IORedis } from 'ioredis';

// ── Redis connection ──────────────────────────────────────────────────────────
// maxRetriesPerRequest: null is required by BullMQ for blocking commands.
export const connection = new IORedis(
  process.env.REDIS_URL ?? 'redis://localhost:6379',
  { maxRetriesPerRequest: null },
);

// ── Queue names ───────────────────────────────────────────────────────────────
export const QUEUE_NAMES = {
  GRAPHIC: 'social.graphic',
  POST:    'social.post',
  PODIUM:  'social.podium',
} as const;

// ── Job data contracts ────────────────────────────────────────────────────────

/** What triggers a social posting pipeline run */
export type TriggerType =
  | 'match_win'
  | 'category_complete'
  | 'tournament_complete';

/**
 * Enqueued by the web app after a match result is confirmed.
 * The graphic worker fetches all render data from Supabase using these IDs.
 */
export interface GraphicJobData {
  triggerType: TriggerType;
  /** ID of the player who will share the post (winner for match_win) */
  playerId: string;
  /** Winning tournament_entries.id */
  entryId: string;
  /** Present for match_win trigger */
  matchId?: string;
  /** Category context for all trigger types */
  categoryId: string;
  tournamentId: string;
}

/**
 * Enqueued by the graphic worker after graphic is rendered + uploaded.
 * One job per platform per post (Instagram, Facebook, X).
 */
export interface PostJobData {
  /** Row ID in social_post_log — used to update status and store platform_post_id */
  postLogId: string;
  playerId: string;
  platform: 'instagram' | 'facebook' | 'x';
  /** Supabase Storage public URL — fetched by Instagram/Facebook directly */
  graphicUrl: string;
  caption: string;
  triggerType: TriggerType;
}

/**
 * Enqueued after a category or tournament completes (organiser posting).
 * Renders podium graphic with winner/runner-up photos + sponsor logos.
 */
export interface PodiumJobData {
  type: 'podium' | 'wrap_up' | 'draw_published' | 'schedule_released';
  categoryId?: string;   // for podium + draw_published
  tournamentId: string;
  clubId: string;
  // Extra context for draw/schedule announcement graphics
  categoryName?: string;
  participantCount?: number;
  drawFormat?: string;
  matchCount?: number;    // for schedule_released
}

// ── Queue instances ───────────────────────────────────────────────────────────
// Both the web app and workers create Queue objects pointing at the same Redis.
// Workers use Worker() — the Queue here is only for job insertion (producers).
export const graphicQueue = new Queue<GraphicJobData>(QUEUE_NAMES.GRAPHIC, { connection });
export const postQueue    = new Queue<PostJobData>(QUEUE_NAMES.POST, { connection });
export const podiumQueue  = new Queue<PodiumJobData>(QUEUE_NAMES.PODIUM, { connection });
