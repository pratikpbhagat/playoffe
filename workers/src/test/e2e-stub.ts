/**
 * Phase 11B — End-to-end stub tests for the social media posting pipeline.
 *
 * Tests the full flow: enqueue → graphic worker → post worker → DB state,
 * with platform APIs (Instagram / Facebook / X) stubbed via fetch interception.
 *
 * Prerequisites:
 *   - Local Supabase running (supabase start)
 *   - Local Redis running (docker start pickleball-redis)
 *   - workers/.env configured with NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *
 * Run:
 *   cd workers && tsx src/test/e2e-stub.ts
 */

import 'dotenv/config';
import { supabase } from '../lib/supabase.js';
import { processGraphicJob } from '../workers/graphic.worker.js';
import { processPostJob }    from '../workers/post.worker.js';
import type { GraphicJobData, PostJobData } from '../queue.js';

// ─── Test fixtures ────────────────────────────────────────────────────────────

// Existing seeded test players (from local Supabase seed data)
const PLAYERS = {
  sam:    { id: '3bffe714-a2fc-4838-87fe-87464d38aa7b', name: 'Sam Chen' },
  alex:   { id: 'cfba91e0-d71c-4dd9-a358-d502995a8c5e', name: 'Alex Rivera' },
};

// Completed match in the seed data
const MATCH = {
  matchId:      'ff000003-0000-0000-0000-000000000001',
  tournamentId: 'cc000002-0000-0000-0000-000000000002',
  categoryId:   'dd000003-0000-0000-0000-000000000003',
  winnerEntryId: 'ee000003-0000-0000-0000-000000000001', // Sam Chen
  winnerId:      PLAYERS.sam.id,
};

// IDs of rows created by the test (cleaned up after)
const testLogIds: string[] = [];

// ─── Platform API stubs ───────────────────────────────────────────────────────

type StubConfig = { instagram?: 'ok' | 'fail'; facebook?: 'ok' | 'fail'; x?: 'ok' | 'fail' };
let _stubConfig: StubConfig = {};

const _realFetch = global.fetch;

function installFetchStubs(cfg: StubConfig = {}) {
  _stubConfig = cfg;
  global.fetch = async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = input.toString();

    // ── Instagram Graph API ──
    if (url.includes('graph.instagram.com')) {
      if (_stubConfig.instagram === 'fail') {
        return new Response(JSON.stringify({ error: { message: 'Invalid token', code: 190 } }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      // /me → user id
      if (url.includes('/me?')) return stubJson({ id: 'ig-user-stub' });
      // /media (container create)
      if (url.endsWith('/media') && init?.method === 'POST') return stubJson({ id: 'ig-container-stub' });
      // /media?fields=status_code (poll)
      if (url.includes('status_code')) return stubJson({ data: [{ status_code: 'FINISHED' }] });
      // /media_publish
      if (url.includes('media_publish')) return stubJson({ id: 'ig-post-stub-001' });
    }

    // ── Facebook / Meta Graph API ──
    if (url.includes('graph.facebook.com')) {
      if (_stubConfig.facebook === 'fail') {
        return new Response(JSON.stringify({ error: { message: 'Invalid permissions', code: 200 } }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return stubJson({ id: 'fb-post-stub-001', post_id: 'fb-post-stub-001' });
    }

    // ── X (Twitter) API ──
    if (url.includes('twitter.com') || url.includes('upload.twitter.com') || url.includes('api.twitter.com')) {
      if (_stubConfig.x === 'fail') {
        return new Response(JSON.stringify({ errors: [{ message: 'Unauthorized', code: 32 }] }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('media/upload')) return stubJson({ media_id_string: 'x-media-stub-001' });
      if (url.includes('/2/tweets'))    return stubJson({ data: { id: 'x-tweet-stub-001' } });
    }

    // ── Anthropic Claude API ──
    if (url.includes('api.anthropic.com')) {
      return stubJson({
        id: 'msg_stub',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: '🏆 Great win today! #pickleball (stub caption)' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 50, output_tokens: 20 },
      });
    }

    // Allow: font CDN, local Supabase, anything else
    return _realFetch(input, init);
  };
}

function removeFetchStubs() {
  global.fetch = _realFetch;
}

function stubJson(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

async function setSocialPrefs(playerId: string, prefs: Record<string, unknown>) {
  const { error } = await supabase
    .from('player_profiles')
    .update({ social_post_prefs: prefs })
    .eq('player_id', playerId);
  if (error) throw new Error(`setSocialPrefs failed: ${error.message}`);
}

async function resetSocialPrefs(playerId: string) {
  await supabase
    .from('player_profiles')
    .update({ social_post_prefs: { paused: false, platforms: {} } })
    .eq('player_id', playerId);
}

async function upsertConnection(playerId: string, platform: string, token = 'stub-token') {
  const { error } = await supabase
    .from('social_connections' as 'social_connections')
    .upsert({
      player_id:            playerId,
      platform,
      access_token:         token,
      platform_username:    'stub_user',
      platform_display_name: 'Stub User',
      is_active:            true,
    }, { onConflict: 'player_id,platform' });
  if (error) throw new Error(`upsertConnection failed: ${error.message}`);
}

async function removeConnection(playerId: string, platform: string) {
  await supabase
    .from('social_connections' as 'social_connections')
    .delete()
    .eq('player_id', playerId)
    .eq('platform', platform);
}

async function getPostLog(ids: string[]) {
  if (ids.length === 0) return [];
  const { data } = await supabase
    .from('social_post_log' as 'social_post_log')
    .select('id, platform, status, platform_post_id, error_message, caption_style, graphic_url, trigger_type')
    .in('id', ids);
  return (data ?? []) as Array<{
    id: string; platform: string; status: string;
    platform_post_id: string | null; error_message: string | null;
    caption_style: string | null; graphic_url: string | null; trigger_type: string;
  }>;
}

async function cleanupPostLog(ids: string[]) {
  if (ids.length === 0) return;
  await supabase
    .from('social_post_log' as 'social_post_log')
    .delete()
    .in('id', ids);
}

// ─── Test runner ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function run(name: string, fn: () => Promise<void>) {
  process.stdout.write(`  ${name}… `);
  try {
    await fn();
    console.log('✅ PASS');
    passed++;
  } catch (err) {
    console.log(`❌ FAIL — ${err instanceof Error ? err.message : String(err)}`);
    failed++;
  }
}

// ─── Shared job factory ───────────────────────────────────────────────────────

function matchWinJob(overrides: Partial<GraphicJobData> = {}): GraphicJobData {
  return {
    triggerType:  'match_win',
    playerId:     MATCH.winnerId,
    entryId:      MATCH.winnerEntryId,
    matchId:      MATCH.matchId,
    categoryId:   MATCH.categoryId,
    tournamentId: MATCH.tournamentId,
    ...overrides,
  };
}

// ─── Scenarios ────────────────────────────────────────────────────────────────

async function scenario1_GlobalPause() {
  // Player has global pause ON → pipeline should skip immediately
  await setSocialPrefs(PLAYERS.sam.id, { paused: true, platforms: {
    instagram: { enabled: true, triggers: { match_win: true }, preview_before_post: false },
  }});
  await upsertConnection(PLAYERS.sam.id, 'instagram');

  const result = await processGraphicJob(matchWinJob(), 'test-s1');

  assert(result.skipped === true, 'Expected skipped=true when globally paused');

  const logs = await getPostLog(testLogIds); // no new logs expected
  const newLogs = logs.filter(l => l.trigger_type === 'match_win' && l.platform === 'instagram');
  assert(newLogs.length === 0, 'No post_log rows should be created when paused');
}

async function scenario2_NoSocialPrefs() {
  // Player has no social_post_prefs at all → skip
  await setSocialPrefs(PLAYERS.sam.id, {});

  const result = await processGraphicJob(matchWinJob(), 'test-s2');

  assert(result.skipped === true, 'Expected skipped=true when prefs missing');
}

async function scenario3_PlatformEnabledButNoConnection() {
  // Platform enabled in prefs but no OAuth connection stored → skip that platform
  await setSocialPrefs(PLAYERS.sam.id, {
    paused: false,
    platforms: {
      instagram: { enabled: true, triggers: { match_win: true }, preview_before_post: false },
    },
  });
  // Ensure no Instagram connection
  await removeConnection(PLAYERS.sam.id, 'instagram');

  const result = await processGraphicJob(matchWinJob(), 'test-s3');

  assert(result.skipped === true, 'Expected skipped=true when connected platform has no OAuth token');
}

async function scenario4_MatchWin_Instagram_PreviewMode() {
  // Platform enabled, connection present, preview_before_post=true
  // → graphic rendered + uploaded, post_log created with status=pending_preview, NO post job queued
  installFetchStubs({ instagram: 'ok' });

  await setSocialPrefs(PLAYERS.sam.id, {
    paused: false,
    platforms: {
      instagram: {
        enabled: true,
        triggers: { match_win: true },
        caption_style: 'humble',
        preview_before_post: true,   // ← preview mode
      },
    },
  });
  await upsertConnection(PLAYERS.sam.id, 'instagram');

  const logsBefore = await supabase
    .from('social_post_log' as 'social_post_log')
    .select('id')
    .eq('player_id', PLAYERS.sam.id);
  const countBefore = (logsBefore.data ?? []).length;

  const result = await processGraphicJob(matchWinJob(), 'test-s4');

  assert(result.done === true, 'Expected done=true');
  assert((result.platforms ?? 0) >= 1, 'Expected at least 1 platform processed');
  assert(result.graphicUrl !== undefined, 'Expected a graphicUrl (uploaded to storage)');

  const { data: newLogs } = await supabase
    .from('social_post_log' as 'social_post_log')
    .select('id, status, platform, graphic_url, caption_style')
    .eq('player_id', PLAYERS.sam.id)
    .eq('trigger_type', 'match_win');

  const fresh = (newLogs ?? []).filter(
    (l) => !(logsBefore.data ?? []).some((b) => (b as { id: string }).id === (l as { id: string }).id),
  );
  testLogIds.push(...fresh.map((l) => (l as { id: string }).id));

  assert(fresh.length > 0, 'Expected a post_log row to be created');
  const logRow = fresh[0] as { status: string; platform: string; graphic_url: string; caption_style: string };
  assert(logRow.status === 'pending_preview', `Expected status=pending_preview, got ${logRow.status}`);
  assert(logRow.platform === 'instagram', 'Expected platform=instagram');
  assert(logRow.graphic_url !== null, 'Expected graphic_url to be set');
  assert(logRow.caption_style === 'humble', 'Expected caption_style=humble');

  removeFetchStubs();
}

async function scenario5_MatchWin_Instagram_AutoPost_Success() {
  // preview_before_post=false → auto-post immediately, platform API called → posted
  installFetchStubs({ instagram: 'ok' });

  await setSocialPrefs(PLAYERS.sam.id, {
    paused: false,
    platforms: {
      instagram: {
        enabled: true,
        triggers: { match_win: true },
        caption_style: 'hype',
        preview_before_post: false,  // ← auto-post
      },
    },
  });
  await upsertConnection(PLAYERS.sam.id, 'instagram');

  // skipEnqueue=true prevents background workers from racing the test
  const result = await processGraphicJob(matchWinJob(), 'test-s5', true);
  assert(result.done === true, 'Graphic job should complete');
  assert((result.postLogIds?.length ?? 0) > 0, 'Expected postLogIds in result');
  const postLogId5 = result.postLogIds![0].id;
  testLogIds.push(postLogId5);

  // Run the post worker directly — no BullMQ involved
  const postResult = await processPostJob({
    postLogId: postLogId5,
    playerId:  PLAYERS.sam.id,
    platform:  'instagram',
    graphicUrl: result.graphicUrl ?? 'https://stub.example.com/graphic.png',
    caption:   '🏆 Test caption',
    triggerType: 'match_win',
  }, 'test-s5-post');
  assert(postResult.success === true, 'Post job should succeed');
  assert(postResult.platformPostId === 'ig-post-stub-001', `Expected ig-post-stub-001, got ${postResult.platformPostId}`);

  // Verify DB updated
  const { data: updated5 } = await supabase
    .from('social_post_log' as any)
    .select('status, platform_post_id')
    .eq('id', postLogId5)
    .single();

  const u5 = updated5 as { status: string; platform_post_id: string };
  assert(u5.status === 'posted', `Expected status=posted, got ${u5.status}`);
  assert(u5.platform_post_id === 'ig-post-stub-001', `Expected ig-post-stub-001, got ${u5.platform_post_id}`);

  removeFetchStubs();
}

async function scenario6_MatchWin_Instagram_AutoPost_Failure() {
  // Platform API returns error → post_log status=failed, error_message set
  installFetchStubs({ instagram: 'fail' });

  await setSocialPrefs(PLAYERS.sam.id, {
    paused: false,
    platforms: {
      instagram: {
        enabled: true,
        triggers: { match_win: true },
        caption_style: 'humble',
        preview_before_post: false,
      },
    },
  });
  await upsertConnection(PLAYERS.sam.id, 'instagram', 'bad-token');

  const result = await processGraphicJob(matchWinJob(), 'test-s6', true);  // skipEnqueue
  assert(result.done === true, 'Graphic job should complete');
  assert((result.postLogIds?.length ?? 0) > 0, 'Expected postLogIds in result');
  const postLogId6 = result.postLogIds![0].id;
  testLogIds.push(postLogId6);

  // Run post worker — expect it to throw (BullMQ would retry on failure)
  let threw = false;
  try {
    await processPostJob({
      postLogId: postLogId6,
      playerId:  PLAYERS.sam.id,
      platform:  'instagram',
      graphicUrl: result.graphicUrl ?? 'https://stub.example.com/graphic.png',
      caption:   '🏆 Test caption',
      triggerType: 'match_win',
    }, 'test-s6-post');
  } catch {
    threw = true;
  }
  assert(threw === true, 'processPostJob should throw on platform failure (so BullMQ retries)');

  const { data: updated6 } = await supabase
    .from('social_post_log' as any)
    .select('status, error_message')
    .eq('id', postLogId6)
    .single();

  const u6 = updated6 as { status: string; error_message: string | null };
  assert(u6.status === 'failed', `Expected status=failed, got ${u6.status}`);
  assert(u6.error_message !== null, 'Expected error_message to be set');
  console.log(`     (error: ${u6.error_message})`);

  removeFetchStubs();
}

async function scenario7_MultiplePlatforms_FacebookAndX() {
  // Player has Facebook + X connected, both enabled, preview=false
  // → two post_log rows, both posted
  installFetchStubs({ facebook: 'ok', x: 'ok' });

  await setSocialPrefs(PLAYERS.sam.id, {
    paused: false,
    platforms: {
      facebook: {
        enabled: true,
        triggers: { match_win: true },
        caption_style: 'motivational',
        preview_before_post: false,
      },
      x: {
        enabled: true,
        triggers: { match_win: true },
        caption_style: 'funny',
        preview_before_post: false,
      },
    },
  });
  await upsertConnection(PLAYERS.sam.id, 'facebook');
  await upsertConnection(PLAYERS.sam.id, 'x');

  const { data: before } = await supabase
    .from('social_post_log' as 'social_post_log')
    .select('id')
    .eq('player_id', PLAYERS.sam.id);

  // skipEnqueue=true — both Facebook and X post log IDs come back in result
  const result = await processGraphicJob(matchWinJob(), 'test-s7', true);
  assert(result.done === true, 'Graphic job should complete');
  assert(result.platforms === 2, `Expected 2 platforms, got ${result.platforms}`);
  assert((result.postLogIds?.length ?? 0) === 2, `Expected 2 postLogIds, got ${result.postLogIds?.length}`);

  const s7Rows = result.postLogIds!;
  testLogIds.push(...s7Rows.map((r) => r.id));

  const platforms7 = s7Rows.map((r) => r.platform).sort();
  assert(platforms7[0] === 'facebook', `Expected facebook, got ${platforms7[0]}`);
  assert(platforms7[1] === 'x', `Expected x, got ${platforms7[1]}`);

  // Run post worker for each
  for (const row of s7Rows) {
    const postResult = await processPostJob({
      postLogId: row.id,
      playerId:  PLAYERS.sam.id,
      platform:  row.platform as 'instagram' | 'facebook' | 'x',
      graphicUrl: result.graphicUrl ?? 'https://stub.example.com/graphic.png',
      caption:   '💪 Multiple platforms test caption',
      triggerType: 'match_win',
    }, `test-s7-${row.platform}`);
    assert(postResult.success === true, `${row.platform} post should succeed`);
  }

  // Verify both are posted
  const { data: finalLogs } = await supabase
    .from('social_post_log' as any)
    .select('platform, status, platform_post_id')
    .in('id', s7Rows.map((r) => r.id));

  for (const log of finalLogs ?? []) {
    const l = log as { platform: string; status: string; platform_post_id: string };
    assert(l.status === 'posted', `${l.platform}: expected status=posted, got ${l.status}`);
    assert(l.platform_post_id !== null, `${l.platform}: expected platform_post_id to be set`);
  }

  removeFetchStubs();
}

async function scenario8_AICaption() {
  // caption_style='ai' → calls Claude API (stubbed) → caption in post_log
  installFetchStubs({ instagram: 'ok' });

  await setSocialPrefs(PLAYERS.sam.id, {
    paused: false,
    platforms: {
      instagram: {
        enabled: true,
        triggers: { match_win: true },
        caption_style: 'ai',            // ← AI caption
        preview_before_post: true,
      },
    },
  });
  await upsertConnection(PLAYERS.sam.id, 'instagram');

  const { data: before } = await supabase
    .from('social_post_log' as 'social_post_log')
    .select('id')
    .eq('player_id', PLAYERS.sam.id);

  // Set a dummy ANTHROPIC_API_KEY so the Claude client initialises
  process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'stub-key-for-test';

  const result = await processGraphicJob(matchWinJob(), 'test-s8');
  assert(result.done === true, 'Graphic job should complete');

  const { data: after } = await supabase
    .from('social_post_log' as 'social_post_log')
    .select('id, caption, caption_style, status')
    .eq('player_id', PLAYERS.sam.id)
    .eq('caption_style', 'ai');

  const beforeIds = new Set((before ?? []).map((r) => (r as { id: string }).id));
  const newRows = (after ?? []).filter((r) => !beforeIds.has((r as { id: string }).id));
  testLogIds.push(...newRows.map((r) => (r as { id: string }).id));

  assert(newRows.length > 0, 'Expected a post_log row with caption_style=ai');
  const logRow = newRows[0] as { caption: string; caption_style: string; status: string };
  assert(logRow.caption !== null, 'Expected a caption to be generated');
  assert(logRow.status === 'pending_preview', 'Expected status=pending_preview');
  console.log(`     (AI caption: "${logRow.caption}")`);

  removeFetchStubs();
}

async function scenario9_CategoryComplete_Trigger() {
  // triggerType=category_complete → different graphic template
  installFetchStubs({ instagram: 'ok' });

  await setSocialPrefs(PLAYERS.sam.id, {
    paused: false,
    platforms: {
      instagram: {
        enabled: true,
        triggers: { match_win: false, category_complete: true },  // ← category trigger
        caption_style: 'humble',
        preview_before_post: true,
      },
    },
  });
  await upsertConnection(PLAYERS.sam.id, 'instagram');

  const result = await processGraphicJob({
    triggerType:  'category_complete',
    playerId:     PLAYERS.sam.id,
    entryId:      MATCH.winnerEntryId,
    categoryId:   MATCH.categoryId,
    tournamentId: MATCH.tournamentId,
  }, 'test-s9');

  assert(result.done === true, 'Category complete job should succeed');
  assert(result.graphicUrl !== undefined, 'Expected a graphicUrl');

  const { data: logs } = await supabase
    .from('social_post_log' as 'social_post_log')
    .select('id, trigger_type, status')
    .eq('player_id', PLAYERS.sam.id)
    .eq('trigger_type', 'category_complete')
    .order('queued_at', { ascending: false })
    .limit(1);

  assert((logs ?? []).length > 0, 'Expected a post_log row for category_complete');
  const logRow = logs![0] as { id: string; trigger_type: string; status: string };
  testLogIds.push(logRow.id);
  assert(logRow.trigger_type === 'category_complete', 'Expected trigger_type=category_complete');
  assert(logRow.status === 'pending_preview', 'Expected status=pending_preview');

  removeFetchStubs();
}

async function scenario10_TriggerNotEnabled() {
  // Platform is enabled but the specific trigger (match_win) is OFF
  // → no platforms eligible → skip
  await setSocialPrefs(PLAYERS.sam.id, {
    paused: false,
    platforms: {
      instagram: {
        enabled: true,
        triggers: { match_win: false, category_complete: true },  // match_win OFF
        caption_style: 'humble',
        preview_before_post: false,
      },
    },
  });
  await upsertConnection(PLAYERS.sam.id, 'instagram');

  const result = await processGraphicJob(matchWinJob(), 'test-s10');

  assert(result.skipped === true, 'Expected skipped=true when match_win trigger is off');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Phase 11B — Social Media Pipeline  |  E2E Stub Tests');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Verify DB connectivity
  const { error: pingErr } = await supabase.from('players').select('id').limit(1);
  if (pingErr) {
    console.error('❌ Cannot reach Supabase — is it running? (supabase start)');
    process.exit(1);
  }
  console.log('  ✓ Supabase connected\n');

  try {
    console.log('── Skip / pause scenarios ──────────────────────────────────');
    await run('S1: Global pause ON → skip', scenario1_GlobalPause);
    await run('S2: No social prefs → skip', scenario2_NoSocialPrefs);
    await run('S3: Platform enabled, no OAuth connection → skip', scenario3_PlatformEnabledButNoConnection);
    await run('S10: match_win trigger disabled → skip', scenario10_TriggerNotEnabled);

    console.log('\n── Preview mode scenarios ──────────────────────────────────');
    await run('S4: Instagram, preview_before_post=true → pending_preview', scenario4_MatchWin_Instagram_PreviewMode);

    console.log('\n── Auto-post scenarios ─────────────────────────────────────');
    await run('S5: Instagram auto-post success → posted + platform_post_id', scenario5_MatchWin_Instagram_AutoPost_Success);
    await run('S6: Instagram auto-post failure → failed + error_message', scenario6_MatchWin_Instagram_AutoPost_Failure);
    await run('S7: Facebook + X, both posted successfully', scenario7_MultiplePlatforms_FacebookAndX);

    console.log('\n── Caption & trigger scenarios ─────────────────────────────');
    await run('S8: AI caption style (Claude API stubbed)', scenario8_AICaption);
    await run('S9: category_complete trigger + category graphic', scenario9_CategoryComplete_Trigger);

  } finally {
    // ── Cleanup ──────────────────────────────────────────────────────────────
    console.log('\n── Cleanup ─────────────────────────────────────────────────');
    await cleanupPostLog(testLogIds);
    await resetSocialPrefs(PLAYERS.sam.id);
    await removeConnection(PLAYERS.sam.id, 'instagram');
    await removeConnection(PLAYERS.sam.id, 'facebook');
    await removeConnection(PLAYERS.sam.id, 'x');
    removeFetchStubs();
    console.log(`  Cleaned up ${testLogIds.length} post_log row(s)\n`);
  }

  // ── Results ───────────────────────────────────────────────────────────────
  const total = passed + failed;
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Results: ${passed}/${total} passed${failed > 0 ? ` | ${failed} FAILED` : ''}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('\n💥 Unexpected error:', err);
  process.exit(1);
});
