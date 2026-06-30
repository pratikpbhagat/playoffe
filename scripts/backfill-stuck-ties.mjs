// One-off backfill: resolve team-event ties that should already be 'completed'
// (every rubber finished) but never got marked, because matches scored via
// the referee PIN flow didn't call checkAndAdvanceTie until that bug was
// fixed. Re-implements decideTieOutcome/checkAndAdvanceTie from
// apps/web/src/lib/actions/scoring.ts against the live DB.
//
// Usage: node scripts/backfill-stuck-ties.mjs

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(join(__dirname, '../apps/web/package.json'));
const { createClient } = require('@supabase/supabase-js');

import { readFileSync } from 'fs';

function loadEnv() {
  try {
    const raw = readFileSync(new URL('../apps/web/.env.local', import.meta.url), 'utf8');
    const entries = {};
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
      entries[key] = val;
    }
    return entries;
  } catch {
    return {};
  }
}

const env = loadEnv();
const SUPABASE_URL = process.env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY. Set it in apps/web/.env.local or as an env variable.');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── decideTieOutcome — mirrors scoring.ts ─────────────────────────────────────
async function decideTieOutcome(tie) {
  const { data: cat } = await admin
    .from('tournament_categories')
    .select('rubber_lineup, decider_format, tournament_id')
    .eq('id', tie.category_id)
    .single();

  const totalMain = (cat?.rubber_lineup ?? []).length;

  const { count: completedMain } = await admin
    .from('matches')
    .select('id', { count: 'exact', head: true })
    .eq('tie_id', tie.id)
    .eq('is_decider', false)
    .in('status', ['completed', 'walkover']);

  if ((completedMain ?? 0) < totalMain) return false;

  const isKnockout = tie.group_name === null;

  if (tie.rubbers_won_a !== tie.rubbers_won_b) {
    const winner = tie.rubbers_won_a > tie.rubbers_won_b ? tie.team_a_id : tie.team_b_id;
    await admin.from('ties').update({ status: 'completed', completed_at: new Date().toISOString(), winner_team_id: winner }).eq('id', tie.id);
    return true;
  }

  if (!isKnockout) {
    await admin.from('ties').update({ status: 'completed', completed_at: new Date().toISOString(), winner_team_id: null }).eq('id', tie.id);
    return true;
  }

  const { data: existingDecider } = await admin
    .from('matches')
    .select('id, status, winner_entry_id')
    .eq('tie_id', tie.id)
    .eq('is_decider', true)
    .maybeSingle();

  if (existingDecider) {
    if (existingDecider.status !== 'completed' && existingDecider.status !== 'walkover') return false;
    const { data: winnerEntry } = await admin
      .from('tournament_entries')
      .select('team_id')
      .eq('id', existingDecider.winner_entry_id)
      .maybeSingle();
    const winner = winnerEntry?.team_id ?? (tie.point_diff_a >= 0 ? tie.team_a_id : tie.team_b_id);
    await admin.from('ties').update({ status: 'completed', completed_at: new Date().toISOString(), winner_team_id: winner }).eq('id', tie.id);
    return true;
  }

  if (!cat?.decider_format) {
    const winner = tie.point_diff_a >= 0 ? tie.team_a_id : tie.team_b_id;
    await admin.from('ties').update({ status: 'completed', completed_at: new Date().toISOString(), winner_team_id: winner }).eq('id', tie.id);
    return true;
  }

  await admin.from('matches').insert({
    tournament_id: cat.tournament_id,
    category_id: tie.category_id,
    round: tie.round,
    tie_id: tie.id,
    rubber_sequence: totalMain + 1,
    is_decider: true,
    status: 'scheduled',
    sets: [],
  });
  await admin.from('ties').update({ status: 'awaiting_decider' }).eq('id', tie.id);
  console.log(`  -> tie ${tie.id} tied on rubbers, decider rubber created (awaiting_decider)`);
  return false;
}

// ── checkAndAdvanceTie — mirrors scoring.ts ───────────────────────────────────
async function checkAndAdvanceTie(tieId) {
  const { data: tie } = await admin
    .from('ties')
    .select('id, category_id, round, group_name, bracket_position, status, winner_team_id, winner_to_tie_id, winner_slot, team_a_id, team_b_id, rubbers_won_a, rubbers_won_b, point_diff_a')
    .eq('id', tieId)
    .single();
  if (!tie) return false;

  if (tie.status !== 'completed') {
    const decided = await decideTieOutcome(tie);
    if (!decided) return false;
  } else {
    return false; // already completed — nothing to backfill
  }

  const { data: freshTie } = await admin
    .from('ties')
    .select('status, winner_team_id, winner_to_tie_id, winner_slot, bracket_position, category_id, round')
    .eq('id', tieId)
    .single();

  if (!freshTie || freshTie.status !== 'completed' || !freshTie.winner_team_id) return true;

  if (freshTie.winner_to_tie_id && freshTie.winner_slot) {
    const slot = freshTie.winner_slot === 'a' ? 'team_a_id' : 'team_b_id';
    await admin.from('ties').update({ [slot]: freshTie.winner_team_id }).eq('id', freshTie.winner_to_tie_id);
    return true;
  }

  if (freshTie.bracket_position !== null) {
    const nextPos = Math.floor(freshTie.bracket_position / 2);
    const slot = freshTie.bracket_position % 2 === 0 ? 'team_a_id' : 'team_b_id';
    const { data: nextTie } = await admin
      .from('ties')
      .select('id')
      .eq('category_id', freshTie.category_id)
      .eq('round', freshTie.round + 1)
      .eq('bracket_position', nextPos)
      .maybeSingle();
    if (nextTie) {
      await admin.from('ties').update({ [slot]: freshTie.winner_team_id }).eq('id', nextTie.id);
    }
  }
  return true;
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  const { data: stuckTies, error } = await admin
    .from('ties')
    .select('id, status, team_a_id, team_b_id')
    .not('status', 'eq', 'completed')
    .not('team_a_id', 'is', null)
    .not('team_b_id', 'is', null);

  if (error) {
    console.error('Failed to fetch ties:', error.message);
    process.exit(1);
  }

  console.log(`Checking ${stuckTies.length} non-completed tie(s) with both teams known...`);

  let resolvedCount = 0;
  for (const tie of stuckTies) {
    const resolved = await checkAndAdvanceTie(tie.id);
    if (resolved) {
      resolvedCount++;
      console.log(`  ✓ tie ${tie.id} resolved`);
    }
  }

  console.log(`\nDone. ${resolvedCount} tie(s) newly resolved out of ${stuckTies.length} checked.`);
}

main();
