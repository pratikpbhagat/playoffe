// Podium Worker — processes social:podium queue jobs.
//
// Handles four organiser post types:
//   podium           → category winner card (rendered after category completes)
//   wrap_up          → full-tournament wrap-up card (rendered when tournament marked complete)
//   draw_published   → draw-is-live announcement (triggered when organiser shares a draw)
//   schedule_released → schedule announcement (triggered when organiser shares match schedule)
//
// All post types: render graphic → upload to Storage → post to club social accounts.

import { Worker } from 'bullmq';
import { connection, QUEUE_NAMES } from '../queue.js';
import type { PodiumJobData } from '../queue.js';
import { supabase, uploadGraphic } from '../lib/supabase.js';
import {
  renderPodium,
  renderDrawAnnouncement,
  renderScheduleAnnouncement,
} from '../lib/graphic.js';
import { postToPlatform } from '../platforms/index.js';

const CONCURRENCY = parseInt(process.env.PODIUM_WORKER_CONCURRENCY ?? '2', 10);

export function startPodiumWorker() {
  const worker = new Worker<PodiumJobData>(
    QUEUE_NAMES.PODIUM,
    async (job) => {
      const { type, categoryId, tournamentId, clubId } = job.data;
      console.log(`[podium] Job ${job.id}: ${type} for tournament ${tournamentId}`);

      // ── Fetch tournament name ─────────────────────────────────────────────
      const { data: tournament } = await supabase
        .from('tournaments')
        .select('name')
        .eq('id', tournamentId)
        .maybeSingle();
      const tournamentName = (tournament as { name: string } | null)?.name ?? 'Tournament';

      // ── Render the correct graphic per type ───────────────────────────────
      let pngBuffer: Buffer;
      let caption: string;

      if (type === 'draw_published') {
        pngBuffer = await renderDrawAnnouncement({
          tournamentName,
          categoryName:     job.data.categoryName ?? 'Category',
          participantCount: job.data.participantCount ?? 0,
          drawFormat:       job.data.drawFormat ?? 'single_elimination',
          platform:         'generic',
        });
        caption = `The draw for ${job.data.categoryName ?? 'the category'} at ${tournamentName} is LIVE! 🎯 Check the bracket. #pickleball`;

      } else if (type === 'schedule_released') {
        pngBuffer = await renderScheduleAnnouncement({
          tournamentName,
          matchCount: job.data.matchCount ?? 0,
          platform:   'generic',
        });
        caption = `Match schedules for ${tournamentName} are out — ${job.data.matchCount ?? 0} matches scheduled. Check your times! 📅 #pickleball`;

      } else {
        // podium or wrap_up — need winner data
        let categoryName: string | undefined;
        let winnerName   = '';
        let runnerUpName: string | undefined;
        let thirdPlaceName: string | undefined;

        if (type === 'podium' && categoryId) {
          const { data: cat } = await supabase
            .from('tournament_categories')
            .select('name, winner_entry_id, runner_up_entry_id, third_place_entry_id')
            .eq('id', categoryId)
            .maybeSingle();

          if (cat) {
            const c = cat as {
              name: string;
              winner_entry_id?: string | null;
              runner_up_entry_id?: string | null;
              third_place_entry_id?: string | null;
            };
            categoryName = c.name;

            const entryIds = [c.winner_entry_id, c.runner_up_entry_id, c.third_place_entry_id]
              .filter(Boolean) as string[];

            if (entryIds.length > 0) {
              const { data: entries } = await supabase
                .from('tournament_entries')
                .select('id, player_id')
                .in('id', entryIds);

              const playerIdByEntry = new Map(
                (entries ?? []).map((e) => [
                  (e as { id: string; player_id: string }).id,
                  (e as { id: string; player_id: string }).player_id,
                ]),
              );

              const playerIds = [...playerIdByEntry.values()];
              const { data: players } = await supabase
                .from('players')
                .select('id, full_name')
                .in('id', playerIds);

              const nameById = new Map(
                (players ?? []).map((p) => [
                  (p as { id: string; full_name: string }).id,
                  (p as { id: string; full_name: string }).full_name,
                ]),
              );

              if (c.winner_entry_id) {
                const pid = playerIdByEntry.get(c.winner_entry_id);
                winnerName = (pid ? nameById.get(pid) : undefined) ?? 'Winner';
              }
              if (c.runner_up_entry_id) {
                const pid = playerIdByEntry.get(c.runner_up_entry_id);
                runnerUpName = pid ? nameById.get(pid) : undefined;
              }
              if (c.third_place_entry_id) {
                const pid = playerIdByEntry.get(c.third_place_entry_id);
                thirdPlaceName = pid ? nameById.get(pid) : undefined;
              }
            }
          }
        }

        if (!winnerName && type === 'podium') {
          console.warn(`[podium] Job ${job.id}: no winner data for podium — skipping`);
          return { skipped: true };
        }

        pngBuffer = await renderPodium({
          type: type as 'podium' | 'wrap_up',
          tournamentName,
          categoryName,
          winnerName,
          runnerUpName,
          thirdPlaceName,
          platform: 'generic',
        });

        caption = type === 'podium'
          ? `🏆 ${categoryName ?? 'Category'} Complete — ${winnerName} wins at ${tournamentName}! #pickleball`
          : `🎾 ${tournamentName} — Tournament wrap-up. Congratulations to all participants! #pickleball`;
      }

      // ── Upload graphic ────────────────────────────────────────────────────
      const fileName = `organiser/${clubId}/${type}-${categoryId ?? tournamentId}-${Date.now()}.png`;
      const graphicUrl = await uploadGraphic(fileName, pngBuffer);
      console.log(`[podium] Job ${job.id}: graphic uploaded → ${graphicUrl}`);

      // ── Log to social_post_log ────────────────────────────────────────────
      await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('social_post_log' as any)
        .insert({
          club_id:      clubId,
          tournament_id: tournamentId,
          trigger_type: type,
          trigger_id:   categoryId ?? tournamentId,
          graphic_url:  graphicUrl,
          caption,
          status:       'posting',
          generated_at: new Date().toISOString(),
        });

      // ── Post to each connected club social platform ───────────────────────
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: clubConns } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('club_social_connections' as any)
        .select('platform, access_token, platform_username')
        .eq('club_id', clubId)
        .eq('is_active', true);

      if (clubConns && (clubConns as any[]).length > 0) {
        for (const conn of clubConns as { platform: string; access_token: string; platform_username: string | null }[]) {
          const result = await postToPlatform({
            platform:         conn.platform as 'instagram' | 'facebook' | 'x',
            playerId:         clubId,
            graphicUrl,
            caption,
            accessToken:      conn.access_token,
            platformUsername: conn.platform_username ?? '',
          });

          console.log(`[podium] Job ${job.id}: ${conn.platform} → ${result.success ? `✓ (${result.platformPostId})` : `✗ (${result.error})`}`);
        }

        // Update status to 'posted' in log
        await supabase
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .from('social_post_log' as any)
          .update({ status: 'posted', posted_at: new Date().toISOString() })
          .eq('club_id', clubId)
          .eq('trigger_type', type)
          .eq('graphic_url', graphicUrl);
      } else {
        console.log(`[podium] Job ${job.id}: no club social connections — graphic at ${graphicUrl}`);
        await supabase
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .from('social_post_log' as any)
          .update({ status: 'skipped' })
          .eq('club_id', clubId)
          .eq('trigger_type', type)
          .eq('graphic_url', graphicUrl);
      }

      return { done: true, graphicUrl };
    },
    { connection, concurrency: CONCURRENCY },
  );

  worker.on('failed', (job, err) => {
    console.error(`[podium] Job ${job?.id} failed:`, err.message);
  });

  console.log(`[podium] Worker started (concurrency ${CONCURRENCY})`);
  return worker;
}
