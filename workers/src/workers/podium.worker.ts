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
  renderGroupSlide,
} from '../lib/graphic.js';
import { postToPlatform } from '../platforms/index.js';
import type { GroupSlideTemplateData, GroupPlayer } from '../lib/templates/group-slide.js';

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

      if (type === 'draw_published' && job.data.drawFormat === 'group_stage_knockout' && categoryId) {
        // ── Group stage: render one slide per group → carousel post ───────────
        console.log(`[podium] Job ${job.id}: group stage draw — building carousel`);
        const groupSlides = await fetchGroupSlides(
          categoryId,
          tournamentName,
          job.data.categoryName ?? 'Category',
        );

        if (groupSlides.length > 1) {
          const carouselUrls: string[] = [];
          const carouselBuffers: Buffer[] = [];

          for (const slide of groupSlides) {
            const png = await renderGroupSlide(slide);
            const safeName = slide.groupName.replace(/\s+/g, '-').toLowerCase();
            const url = await uploadGraphic(
              `organiser/${clubId}/carousel-${safeName}-${Date.now()}.png`,
              png,
            );
            carouselUrls.push(url);
            carouselBuffers.push(png);
          }

          const carouselCaption = `The draw for ${job.data.categoryName ?? 'the category'} at ${tournamentName} is LIVE! 🎯 Swipe to see all ${groupSlides.length} groups 👉 #pickleball`;
          console.log(`[podium] Job ${job.id}: ${groupSlides.length} group slides rendered`);

          // Post carousel to each connected platform
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
                graphicUrl:       carouselUrls[0],   // primary (fallback for single-image path)
                caption:          carouselCaption,
                accessToken:      conn.access_token,
                platformUsername: conn.platform_username ?? '',
                carouselUrls,
                carouselBuffers,
              });
              console.log(`[podium] Job ${job.id}: carousel → ${conn.platform} ${result.success ? `✓ (${result.platformPostId})` : `✗ (${result.error})`}`);
            }
          }

          return { done: true, graphicUrls: carouselUrls, slides: groupSlides.length };
        }
        // Only 1 group (very rare) → fall through to single-image path below
      }

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

// ── Group slides helper ───────────────────────────────────────────────────────

/**
 * Fetches all group-stage matches for a category, groups them by `group_name`,
 * deduplicates players per group, and returns one GroupSlideTemplateData per group.
 * Groups are sorted alphabetically (Group A, Group B, …).
 */
async function fetchGroupSlides(
  categoryId: string,
  tournamentName: string,
  categoryName: string,
): Promise<GroupSlideTemplateData[]> {
  // 0. Fetch category play_format to determine singles vs doubles
  const { data: categoryRow } = await supabase
    .from('tournament_categories')
    .select('play_format')
    .eq('id', categoryId)
    .maybeSingle();

  const isDoubles =
    (categoryRow as { play_format: string } | null)?.play_format === 'doubles' ||
    (categoryRow as { play_format: string } | null)?.play_format === 'mixed_doubles';

  // 1. Fetch all group-stage matches (group_name IS NOT NULL)
  const { data: matches } = await supabase
    .from('matches')
    .select('group_name, entry_a_id, entry_b_id')
    .eq('category_id', categoryId)
    .not('group_name', 'is', null)
    .order('group_name', { ascending: true });

  if (!matches || matches.length === 0) return [];

  // 2. Collect unique entry IDs per group
  const groupEntries = new Map<string, Set<string>>();
  for (const m of matches as { group_name: string; entry_a_id: string | null; entry_b_id: string | null }[]) {
    const group = m.group_name;
    if (!groupEntries.has(group)) groupEntries.set(group, new Set());
    if (m.entry_a_id) groupEntries.get(group)!.add(m.entry_a_id);
    if (m.entry_b_id) groupEntries.get(group)!.add(m.entry_b_id);
  }

  if (groupEntries.size === 0) return [];

  // 3. Fetch all entries — include partner_id for doubles
  const allEntryIds = [...new Set([...groupEntries.values()].flatMap((s) => [...s]))];
  const { data: entries } = await supabase
    .from('tournament_entries')
    .select('id, player_id, partner_id, seed')
    .in('id', allEntryIds);

  const playerIdByEntry  = new Map<string, string>();
  const partnerIdByEntry = new Map<string, string | null>();
  const seedByEntry      = new Map<string, number | null>();

  for (const e of (entries ?? []) as { id: string; player_id: string; partner_id: string | null; seed: number | null }[]) {
    playerIdByEntry.set(e.id, e.player_id);
    partnerIdByEntry.set(e.id, e.partner_id);
    seedByEntry.set(e.id, e.seed);
  }

  // 4. Collect ALL player IDs (primary + partners) for a single batch name fetch
  const allPlayerIds = [...new Set([
    ...[...playerIdByEntry.values()],
    ...[...partnerIdByEntry.values()].filter(Boolean) as string[],
  ])];

  const { data: playerRows } = await supabase
    .from('players')
    .select('id, full_name')
    .in('id', allPlayerIds);

  const nameById = new Map<string, string>();
  for (const p of (playerRows ?? []) as { id: string; full_name: string }[]) {
    nameById.set(p.id, p.full_name);
  }

  // 5. Build one GroupSlideTemplateData per group, sorted A→Z
  const sortedGroups = [...groupEntries.keys()].sort();
  const totalSlides  = sortedGroups.length;

  return sortedGroups.map((groupName, idx) => {
    const entryIds = [...groupEntries.get(groupName)!];

    // Sort entries by seed (nulls last), then primary player name
    const sortedEntries = entryIds.sort((a, b) => {
      const sa = seedByEntry.get(a) ?? 999;
      const sb = seedByEntry.get(b) ?? 999;
      if (sa !== sb) return sa - sb;
      const na = nameById.get(playerIdByEntry.get(a) ?? '') ?? '';
      const nb = nameById.get(playerIdByEntry.get(b) ?? '') ?? '';
      return na.localeCompare(nb);
    });

    const groupPlayers: GroupPlayer[] = sortedEntries.map((eid) => {
      const primaryName  = nameById.get(playerIdByEntry.get(eid) ?? '') ?? 'Player';
      const partnerId    = partnerIdByEntry.get(eid) ?? null;
      const partnerName  = partnerId ? (nameById.get(partnerId) ?? undefined) : undefined;
      return { name: primaryName, partnerName };
    });

    return {
      tournamentName,
      categoryName,
      groupName,
      players:    groupPlayers,
      isDoubles,
      slideIndex: idx,
      totalSlides,
      platform:   'generic',
    };
  });
}
