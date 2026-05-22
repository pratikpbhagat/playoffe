// PLAYOFFE Dev Seed Script
// Usage: node scripts/seed.mjs
// Seeds 8 players, 2 clubs, 4 tournaments (various statuses), 7 categories,
// full round-robin & elimination matches, announcements, and display state
// so every screen in the app has something to show.
//
// All accounts use password: Password123!
// ─────────────────────────────────────────────────────────────────────────────

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(join(__dirname, '../apps/web/package.json'));
const { createClient } = require('@supabase/supabase-js');

// Read credentials from environment or .env.local
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

const ok = (label, error) => {
  if (error) { console.error(`  ✗ ${label}: ${error.message}`); process.exit(1); }
  console.log(`  ✓ ${label}`);
};

// ── Upsert an auth user (create if missing, return id) ───────────────────────
async function upsertUser(email, password, fullName) {
  const { data: { users } } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const existing = users.find(u => u.email === email);
  if (existing) return existing.id;
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error) { console.error(`  ✗ createUser(${email}): ${error.message}`); process.exit(1); }
  return data.user.id;
}

// ── Fixed UUIDs (clubs, tournaments, categories, entries, matches) ────────────
const CID = {
  sydney: 'bb000001-0000-0000-0000-000000000001',
  melb:   'bb000002-0000-0000-0000-000000000002',
};
const TID = {
  t1: 'cc000001-0000-0000-0000-000000000001', // Winter Classic  — registration_open
  t2: 'cc000002-0000-0000-0000-000000000002', // Summer Open     — in_progress (RR + bracket)
  t3: 'cc000003-0000-0000-0000-000000000003', // Melbourne Open  — in_progress (SE bracket)
  t4: 'cc000004-0000-0000-0000-000000000004', // New Year Cup    — completed
};
const CATID = {
  t1_singles: 'dd000001-0000-0000-0000-000000000001',
  t1_doubles: 'dd000002-0000-0000-0000-000000000002',
  t2_rr:      'dd000003-0000-0000-0000-000000000003', // round_robin
  t2_se:      'dd000004-0000-0000-0000-000000000004', // single_elimination
  t3_se:      'dd000005-0000-0000-0000-000000000005', // single_elimination
  t4_rr:      'dd000006-0000-0000-0000-000000000006', // round_robin  — completed
  t4_se:      'dd000007-0000-0000-0000-000000000007', // single_elimination — completed
};

// ── Entry ID factory ──────────────────────────────────────────────────────────
const e = (cat, n) => `ee${String(cat).padStart(6,'0')}-0000-0000-0000-${String(n).padStart(12,'0')}`;
const EID = {
  // T1 Men's Singles (CAT 1) — manual approval
  t1s1: e(1,1), t1s2: e(1,2), t1s3: e(1,3), t1s4: e(1,4), t1s5: e(1,5),
  // T1 Mixed Doubles (CAT 2)
  t1d1: e(2,1), t1d2: e(2,2), t1d3: e(2,3), t1d4: e(2,4),
  // T2 RR (CAT 3)
  t2r1: e(3,1), t2r2: e(3,2), t2r3: e(3,3), t2r4: e(3,4),
  // T2 SE (CAT 4)
  t2e1: e(4,1), t2e2: e(4,2), t2e3: e(4,3), t2e4: e(4,4),
  // T3 SE (CAT 5)
  t3e1: e(5,1), t3e2: e(5,2), t3e3: e(5,3), t3e4: e(5,4),
  // T4 RR (CAT 6)
  t4r1: e(6,1), t4r2: e(6,2), t4r3: e(6,3), t4r4: e(6,4),
  // T4 SE (CAT 7)
  t4e1: e(7,1), t4e2: e(7,2), t4e3: e(7,3), t4e4: e(7,4),
};

// ── Match ID factory ──────────────────────────────────────────────────────────
const m = (cat, n) => `ff${String(cat).padStart(6,'0')}-0000-0000-0000-${String(n).padStart(12,'0')}`;
const MID = {
  // T2 RR round-robin matches (6 = 4-choose-2)
  t2rr1: m(3,1), t2rr2: m(3,2),
  t2rr3: m(3,3), t2rr4: m(3,4),
  t2rr5: m(3,5), t2rr6: m(3,6),
  // T2 SE bracket (semi x2, final)
  t2s1: m(4,1), t2s2: m(4,2), t2s3: m(4,3),
  // T3 SE bracket (semi x2, final)
  t3s1: m(5,1), t3s2: m(5,2), t3s3: m(5,3),
  // T4 RR all 6 matches
  t4r1: m(6,1), t4r2: m(6,2),
  t4r3: m(6,3), t4r4: m(6,4),
  t4r5: m(6,5), t4r6: m(6,6),
  // T4 SE (semi x2, final)
  t4e1: m(7,1), t4e2: m(7,2), t4e3: m(7,3),
};

// ── Time helpers ──────────────────────────────────────────────────────────────
const ago  = (ms) => new Date(Date.now() - ms).toISOString();
const from = (ms) => new Date(Date.now() + ms).toISOString();
const H = 3600000, MIN = 60000;

// ─────────────────────────────────────────────────────────────────────────────
async function seed() {
  console.log('\n🌱  Seeding PLAYOFFE local database…\n');

  // ── 1. Auth users ────────────────────────────────────────────────────────
  console.log('  Creating auth users (this may take a moment)…');
  const PW = 'Password123!';
  const PID = {
    alex:   await upsertUser('alex@playoffe.dev',   PW, 'Alex Rivera'),
    sam:    await upsertUser('sam@playoffe.dev',    PW, 'Sam Chen'),
    jordan: await upsertUser('jordan@playoffe.dev', PW, 'Jordan Kim'),
    taylor: await upsertUser('taylor@playoffe.dev', PW, 'Taylor Brown'),
    morgan: await upsertUser('morgan@playoffe.dev', PW, 'Morgan Lee'),
    casey:  await upsertUser('casey@playoffe.dev',  PW, 'Casey Wilson'),
    riley:  await upsertUser('riley@playoffe.dev',  PW, 'Riley Martinez'),
    drew:   await upsertUser('drew@playoffe.dev',   PW, 'Drew Thompson'),
  };
  console.log('  ✓ auth users (8)');

  // ── 2. Players ───────────────────────────────────────────────────────────
  const { error: pErr } = await admin.from('players').upsert([
    { id: PID.alex,   email: 'alex@playoffe.dev',   username: 'alex-rivera',    full_name: 'Alex Rivera',    gender: 'male',   dob: '1990-03-15', location: 'Sydney, Australia',    role: 'organizer', is_provisional: false },
    { id: PID.sam,    email: 'sam@playoffe.dev',    username: 'sam-chen',       full_name: 'Sam Chen',       gender: 'male',   dob: '1992-07-22', location: 'Sydney, Australia',    role: 'player',    is_provisional: false },
    { id: PID.jordan, email: 'jordan@playoffe.dev', username: 'jordan-kim',     full_name: 'Jordan Kim',     gender: 'male',   dob: '1995-11-08', location: 'Sydney, Australia',    role: 'player',    is_provisional: false },
    { id: PID.taylor, email: 'taylor@playoffe.dev', username: 'taylor-brown',   full_name: 'Taylor Brown',   gender: 'female', dob: '1997-04-30', location: 'Melbourne, Australia', role: 'player',    is_provisional: false },
    { id: PID.morgan, email: 'morgan@playoffe.dev', username: 'morgan-lee',     full_name: 'Morgan Lee',     gender: 'female', dob: '1993-09-14', location: 'Brisbane, Australia',  role: 'player',    is_provisional: false },
    { id: PID.casey,  email: 'casey@playoffe.dev',  username: 'casey-wilson',   full_name: 'Casey Wilson',   gender: 'other',  dob: '1998-01-25', location: 'Sydney, Australia',    role: 'player',    is_provisional: false },
    { id: PID.riley,  email: 'riley@playoffe.dev',  username: 'riley-martinez', full_name: 'Riley Martinez', gender: 'female', dob: '1994-06-18', location: 'Sydney, Australia',    role: 'player',    is_provisional: false },
    { id: PID.drew,   email: 'drew@playoffe.dev',   username: 'drew-thompson',  full_name: 'Drew Thompson',  gender: 'male',   dob: '1991-12-03', location: 'Canberra, Australia',  role: 'player',    is_provisional: false },
  ], { onConflict: 'id' });
  ok('players (8)', pErr);

  // ── 3. Global stats ──────────────────────────────────────────────────────
  const { error: gsErr } = await admin.from('global_stats').upsert([
    { player_id: PID.alex,   total_matches: 5,  wins: 3,  losses: 2, win_rate: 0.6000, current_rating: 3.75, peak_rating: 3.75, singles_matches: 5,  singles_wins: 3,  doubles_matches: 0, doubles_wins: 0, mixed_doubles_matches: 0, mixed_doubles_wins: 0 },
    { player_id: PID.sam,    total_matches: 20, wins: 15, losses: 5, win_rate: 0.7500, current_rating: 4.25, peak_rating: 4.50, singles_matches: 16, singles_wins: 13, doubles_matches: 4, doubles_wins: 2, mixed_doubles_matches: 0, mixed_doubles_wins: 0 },
    { player_id: PID.jordan, total_matches: 15, wins: 9,  losses: 6, win_rate: 0.6000, current_rating: 3.85, peak_rating: 4.00, singles_matches: 12, singles_wins: 7,  doubles_matches: 3, doubles_wins: 2, mixed_doubles_matches: 0, mixed_doubles_wins: 0 },
    { player_id: PID.taylor, total_matches: 12, wins: 5,  losses: 7, win_rate: 0.4167, current_rating: 3.50, peak_rating: 3.65, singles_matches: 10, singles_wins: 4,  doubles_matches: 2, doubles_wins: 1, mixed_doubles_matches: 0, mixed_doubles_wins: 0 },
    { player_id: PID.morgan, total_matches: 10, wins: 4,  losses: 6, win_rate: 0.4000, current_rating: 3.35, peak_rating: 3.50, singles_matches: 8,  singles_wins: 3,  doubles_matches: 2, doubles_wins: 1, mixed_doubles_matches: 0, mixed_doubles_wins: 0 },
    { player_id: PID.casey,  total_matches: 8,  wins: 4,  losses: 4, win_rate: 0.5000, current_rating: 3.60, peak_rating: 3.60, singles_matches: 6,  singles_wins: 4,  doubles_matches: 2, doubles_wins: 0, mixed_doubles_matches: 0, mixed_doubles_wins: 0 },
    { player_id: PID.riley,  total_matches: 18, wins: 11, losses: 7, win_rate: 0.6111, current_rating: 3.90, peak_rating: 4.10, singles_matches: 14, singles_wins: 9,  doubles_matches: 4, doubles_wins: 2, mixed_doubles_matches: 0, mixed_doubles_wins: 0 },
    { player_id: PID.drew,   total_matches: 6,  wins: 2,  losses: 4, win_rate: 0.3333, current_rating: 3.25, peak_rating: 3.35, singles_matches: 6,  singles_wins: 2,  doubles_matches: 0, doubles_wins: 0, mixed_doubles_matches: 0, mixed_doubles_wins: 0 },
  ], { onConflict: 'player_id' });
  ok('global stats', gsErr);

  // ── 4. Player profiles ───────────────────────────────────────────────────
  const { error: ppErr } = await admin.from('player_profiles').upsert([
    { player_id: PID.alex,   bio: 'Tournament organiser and club owner. Passionate about growing pickleball in Australia.', headline: 'Organiser · Sydney Pickleball Club', playing_since: 2018 },
    { player_id: PID.sam,    bio: 'Competitive singles player based in Sydney. Former tennis player turned pickleball addict.', headline: 'Open Singles Competitor', playing_since: 2019, preferred_style: 'aggressive-baseline' },
    { player_id: PID.jordan, bio: 'Mixed doubles specialist. Love the strategy side of the game.', headline: 'Doubles Specialist', playing_since: 2020 },
    { player_id: PID.taylor, bio: 'Weekend warrior from Melbourne. Working my way up to the A grade.', headline: 'Enthusiast', playing_since: 2021 },
    { player_id: PID.morgan, bio: 'Pickleball coach and competitive player based in Brisbane.', headline: 'Coach & Competitor', playing_since: 2020 },
    { player_id: PID.casey,  bio: null, headline: null, playing_since: 2022 },
    { player_id: PID.riley,  bio: 'Junior champion turned senior competitor. Love the fast-paced singles game.', headline: 'Competitive Player', playing_since: 2019 },
    { player_id: PID.drew,   bio: null, headline: null, playing_since: 2023 },
  ], { onConflict: 'player_id' });
  ok('player profiles', ppErr);

  // ── 5. Clubs ─────────────────────────────────────────────────────────────
  const { error: cErr } = await admin.from('clubs').upsert([
    { id: CID.sydney, name: 'Sydney Pickleball Club', slug: 'sydney-pickleball', brand_primary_color: '#16a34a', brand_secondary_color: '#15803d', city: 'Sydney',    country: 'Australia', subscription_tier: 'pro',     description: "Sydney's premier pickleball club, hosting weekly socials and competitive tournaments.", founding_year: 2019, is_open_to_join: true },
    { id: CID.melb,   name: 'Melbourne Picklers',     slug: 'melbourne-picklers', brand_primary_color: '#7c3aed', brand_secondary_color: '#6d28d9', city: 'Melbourne', country: 'Australia', subscription_tier: 'starter', description: "Melbourne's fastest growing pickleball community.",                              founding_year: 2021, is_open_to_join: true },
  ], { onConflict: 'id' });
  ok('clubs (2)', cErr);

  // ── 6. Club managers ─────────────────────────────────────────────────────
  const { error: cmErr } = await admin.from('club_managers').upsert([
    { club_id: CID.sydney, player_id: PID.alex, role: 'owner' },
    { club_id: CID.melb,   player_id: PID.alex, role: 'owner' },
  ], { onConflict: 'club_id,player_id' });
  ok('club managers', cmErr);

  // ── 7. Club affiliations ─────────────────────────────────────────────────
  const affils = [
    ...[PID.alex, PID.sam, PID.jordan, PID.taylor, PID.casey, PID.riley]
      .map(pid => ({ player_id: pid, club_id: CID.sydney, is_current: true })),
    ...[PID.morgan, PID.drew]
      .map(pid => ({ player_id: pid, club_id: CID.melb, is_current: true })),
  ];
  // upsert one by one to ignore dupe-key quietly
  for (const a of affils) {
    const { error } = await admin.from('club_affiliations').upsert(a, { onConflict: 'player_id,club_id,is_current' });
    if (error && !error.code?.includes('23505')) console.warn('    affil warn:', error.message);
  }
  console.log('  ✓ club affiliations');

  // ── 8. Tournaments ───────────────────────────────────────────────────────
  const { error: tErr } = await admin.from('tournaments').upsert([
    {
      id: TID.t1, club_id: CID.sydney, created_by: PID.alex,
      name: 'Winter Classic 2026',
      description: 'Annual winter championship open to all skill levels. Manual approval required — register early to secure your spot.',
      venue: 'Homebush Bay Sports Centre', start_date: '2026-07-12', end_date: '2026-07-13',
      status: 'registration_open', court_count: 6, display_code: 'WINTER26',
      registration_deadline: '2026-07-05', max_participants: 64, auto_approve_entries: false,
    },
    {
      id: TID.t2, club_id: CID.sydney, created_by: PID.alex,
      name: 'Summer Open 2026',
      description: 'Our flagship summer tournament. Group stage round-robin followed by elimination finals across 4 categories.',
      venue: 'Sydney Olympic Park Tennis Centre', start_date: '2026-01-18', end_date: '2026-01-19',
      status: 'in_progress', court_count: 4, display_code: 'SUMMER26',
      auto_approve_entries: true,
    },
    {
      id: TID.t3, club_id: CID.melb, created_by: PID.alex,
      name: 'Melbourne Open 2026',
      description: 'Premier singles event hosted by Melbourne Picklers. Singles bracket, semi-finals underway.',
      venue: 'Melbourne Pickleball Hub', start_date: '2026-02-08', end_date: '2026-02-08',
      status: 'in_progress', court_count: 3, display_code: 'MELB2026',
      auto_approve_entries: true,
    },
    {
      id: TID.t4, club_id: CID.sydney, created_by: PID.alex,
      name: 'New Year Cup 2025',
      description: 'Season finale. Full day of competitive play at Darling Harbour — celebrating another great year of pickleball.',
      venue: 'Darling Harbour Courts', start_date: '2025-12-28', end_date: '2025-12-28',
      status: 'completed', court_count: 2, display_code: 'NEWYEAR5',
      auto_approve_entries: true,
    },
  ], { onConflict: 'id' });
  ok('tournaments (4)', tErr);

  // ── 9. Categories ────────────────────────────────────────────────────────
  const { error: catErr } = await admin.from('tournament_categories').upsert([
    // T1 — registration_open, manual approval
    { id: CATID.t1_singles, tournament_id: TID.t1, name: "Men's Singles Open",  type: 'open',  play_format: 'singles',       draw_format: 'single_elimination', status: 'registration', max_entries: 32 },
    { id: CATID.t1_doubles, tournament_id: TID.t1, name: 'Mixed Doubles Open',  type: 'open',  play_format: 'mixed_doubles', draw_format: 'single_elimination', status: 'registration', max_entries: 16 },
    // T2 — in_progress
    { id: CATID.t2_rr,      tournament_id: TID.t2, name: "Men's Singles A",     type: 'skill', play_format: 'singles',       draw_format: 'round_robin',        status: 'in_progress',   max_entries: null },
    { id: CATID.t2_se,      tournament_id: TID.t2, name: "Women's Singles Open",type: 'open',  play_format: 'singles',       draw_format: 'single_elimination', status: 'draw_generated',max_entries: null },
    // T3 — in_progress
    { id: CATID.t3_se,      tournament_id: TID.t3, name: "Men's Singles Open",  type: 'open',  play_format: 'singles',       draw_format: 'single_elimination', status: 'in_progress',   max_entries: null },
    // T4 — completed
    { id: CATID.t4_rr,      tournament_id: TID.t4, name: 'Mixed Doubles Open',  type: 'open',  play_format: 'mixed_doubles', draw_format: 'round_robin',        status: 'completed',     max_entries: null },
    { id: CATID.t4_se,      tournament_id: TID.t4, name: "Men's Singles B",     type: 'skill', play_format: 'singles',       draw_format: 'single_elimination', status: 'completed',     max_entries: 8 },
  ], { onConflict: 'id' });
  ok('categories (7)', catErr);

  // ── 10. Entries ──────────────────────────────────────────────────────────
  const { error: eErr } = await admin.from('tournament_entries').upsert([
    // T1 Men's Singles — pending/waitlisted visible in approval queue
    { id: EID.t1s1, tournament_id: TID.t1, category_id: CATID.t1_singles, player_id: PID.sam,    status: 'active',     seed: 1, registered_at: ago(14*24*H) },
    { id: EID.t1s2, tournament_id: TID.t1, category_id: CATID.t1_singles, player_id: PID.jordan, status: 'active',     seed: 2, registered_at: ago(14*24*H) },
    { id: EID.t1s3, tournament_id: TID.t1, category_id: CATID.t1_singles, player_id: PID.taylor, status: 'pending',         registered_at: ago(7*24*H) },
    { id: EID.t1s4, tournament_id: TID.t1, category_id: CATID.t1_singles, player_id: PID.morgan, status: 'pending',         registered_at: ago(3*24*H) },
    { id: EID.t1s5, tournament_id: TID.t1, category_id: CATID.t1_singles, player_id: PID.casey,  status: 'waitlisted',      registered_at: ago(1*24*H) },
    // T1 Mixed Doubles — two pending
    { id: EID.t1d1, tournament_id: TID.t1, category_id: CATID.t1_doubles, player_id: PID.sam,    status: 'active',          registered_at: ago(14*24*H) },
    { id: EID.t1d2, tournament_id: TID.t1, category_id: CATID.t1_doubles, player_id: PID.morgan, status: 'active',          registered_at: ago(14*24*H) },
    { id: EID.t1d3, tournament_id: TID.t1, category_id: CATID.t1_doubles, player_id: PID.jordan, status: 'pending',         registered_at: ago(5*24*H) },
    { id: EID.t1d4, tournament_id: TID.t1, category_id: CATID.t1_doubles, player_id: PID.taylor, status: 'pending',         registered_at: ago(2*24*H) },
    // T2 Round-Robin — 4 active
    { id: EID.t2r1, tournament_id: TID.t2, category_id: CATID.t2_rr, player_id: PID.sam,    status: 'active', seed: 1, registered_at: ago(14*24*H) },
    { id: EID.t2r2, tournament_id: TID.t2, category_id: CATID.t2_rr, player_id: PID.jordan, status: 'active', seed: 2, registered_at: ago(14*24*H) },
    { id: EID.t2r3, tournament_id: TID.t2, category_id: CATID.t2_rr, player_id: PID.taylor, status: 'active',          registered_at: ago(7*24*H) },
    { id: EID.t2r4, tournament_id: TID.t2, category_id: CATID.t2_rr, player_id: PID.morgan, status: 'active',          registered_at: ago(7*24*H) },
    // T2 Single Elimination — 4 active (Women's)
    { id: EID.t2e1, tournament_id: TID.t2, category_id: CATID.t2_se, player_id: PID.casey,  status: 'active', seed: 1, registered_at: ago(14*24*H) },
    { id: EID.t2e2, tournament_id: TID.t2, category_id: CATID.t2_se, player_id: PID.riley,  status: 'active', seed: 2, registered_at: ago(14*24*H) },
    { id: EID.t2e3, tournament_id: TID.t2, category_id: CATID.t2_se, player_id: PID.drew,   status: 'active',          registered_at: ago(7*24*H) },
    { id: EID.t2e4, tournament_id: TID.t2, category_id: CATID.t2_se, player_id: PID.morgan, status: 'active',          registered_at: ago(7*24*H) },
    // T3 Singles — 4 active
    { id: EID.t3e1, tournament_id: TID.t3, category_id: CATID.t3_se, player_id: PID.sam,    status: 'active', seed: 1, registered_at: ago(14*24*H) },
    { id: EID.t3e2, tournament_id: TID.t3, category_id: CATID.t3_se, player_id: PID.jordan, status: 'active', seed: 2, registered_at: ago(14*24*H) },
    { id: EID.t3e3, tournament_id: TID.t3, category_id: CATID.t3_se, player_id: PID.taylor, status: 'active',          registered_at: ago(7*24*H) },
    { id: EID.t3e4, tournament_id: TID.t3, category_id: CATID.t3_se, player_id: PID.morgan, status: 'active',          registered_at: ago(7*24*H) },
    // T4 Mixed Doubles RR — 4 active
    { id: EID.t4r1, tournament_id: TID.t4, category_id: CATID.t4_rr, player_id: PID.sam,    status: 'active', registered_at: ago(30*24*H) },
    { id: EID.t4r2, tournament_id: TID.t4, category_id: CATID.t4_rr, player_id: PID.jordan, status: 'active', registered_at: ago(30*24*H) },
    { id: EID.t4r3, tournament_id: TID.t4, category_id: CATID.t4_rr, player_id: PID.taylor, status: 'active', registered_at: ago(28*24*H) },
    { id: EID.t4r4, tournament_id: TID.t4, category_id: CATID.t4_rr, player_id: PID.morgan, status: 'active', registered_at: ago(28*24*H) },
    // T4 Singles SE — 4 active
    { id: EID.t4e1, tournament_id: TID.t4, category_id: CATID.t4_se, player_id: PID.sam,    status: 'active', seed: 1, registered_at: ago(30*24*H) },
    { id: EID.t4e2, tournament_id: TID.t4, category_id: CATID.t4_se, player_id: PID.jordan, status: 'active', seed: 2, registered_at: ago(30*24*H) },
    { id: EID.t4e3, tournament_id: TID.t4, category_id: CATID.t4_se, player_id: PID.casey,  status: 'active',          registered_at: ago(28*24*H) },
    { id: EID.t4e4, tournament_id: TID.t4, category_id: CATID.t4_se, player_id: PID.drew,   status: 'active',          registered_at: ago(28*24*H) },
  ], { onConflict: 'id' });
  ok('entries (29)', eErr);

  // ── 11. Matches ──────────────────────────────────────────────────────────
  const sets = (...pairs) => pairs.map((p, i) => ({ set_number: i + 1, score_a: p[0], score_b: p[1] }));

  const { error: mErr } = await admin.from('matches').upsert([

    // ── T2 Men's Singles A  (round_robin, Group A) ─────────────────────────
    // Round 1: Sam beats Jordan; Morgan beats Taylor (3 sets)
    { id: MID.t2rr1, tournament_id: TID.t2, category_id: CATID.t2_rr, round: 1, round_name: 'Round 1', group_name: 'Group A', entry_a_id: EID.t2r1, entry_b_id: EID.t2r2, court: 1, bracket_position: 0, status: 'completed', winner_entry_id: EID.t2r1, sets: sets([11,8],[11,6]),          completed_at: ago(7*H) },
    { id: MID.t2rr2, tournament_id: TID.t2, category_id: CATID.t2_rr, round: 1, round_name: 'Round 1', group_name: 'Group A', entry_a_id: EID.t2r3, entry_b_id: EID.t2r4, court: 2, bracket_position: 1, status: 'completed', winner_entry_id: EID.t2r4, sets: sets([8,11],[11,9],[9,11]),    completed_at: ago(6*H) },
    // Round 2: Sam v Taylor in_progress; Jordan beats Morgan
    { id: MID.t2rr3, tournament_id: TID.t2, category_id: CATID.t2_rr, round: 2, round_name: 'Round 2', group_name: 'Group A', entry_a_id: EID.t2r1, entry_b_id: EID.t2r3, court: 1, bracket_position: 0, status: 'in_progress',                        sets: sets([9,7]),               started_at: ago(25*MIN) },
    { id: MID.t2rr4, tournament_id: TID.t2, category_id: CATID.t2_rr, round: 2, round_name: 'Round 2', group_name: 'Group A', entry_a_id: EID.t2r2, entry_b_id: EID.t2r4, court: 2, bracket_position: 1, status: 'completed', winner_entry_id: EID.t2r2, sets: sets([11,4],[11,7]),          completed_at: ago(3*H) },
    // Round 3: Sam v Morgan scheduled; Jordan v Taylor scheduled
    { id: MID.t2rr5, tournament_id: TID.t2, category_id: CATID.t2_rr, round: 3, round_name: 'Round 3', group_name: 'Group A', entry_a_id: EID.t2r1, entry_b_id: EID.t2r4, court: 1, bracket_position: 0, status: 'scheduled', sets: [], scheduled_time: from(2*H) },
    { id: MID.t2rr6, tournament_id: TID.t2, category_id: CATID.t2_rr, round: 3, round_name: 'Round 3', group_name: 'Group A', entry_a_id: EID.t2r2, entry_b_id: EID.t2r3, court: 2, bracket_position: 1, status: 'scheduled', sets: [], scheduled_time: from(3*H) },

    // ── T2 Women's Singles  (single_elimination, draw_generated) ──────────────
    // Semis: Casey beats Drew; Riley beats Morgan
    { id: MID.t2s1, tournament_id: TID.t2, category_id: CATID.t2_se, round: 1, round_name: 'Semi-Final', entry_a_id: EID.t2e1, entry_b_id: EID.t2e3, court: 3, bracket_position: 0, status: 'completed', winner_entry_id: EID.t2e1, sets: sets([11,7],[11,5]), completed_at: ago(5*H) },
    { id: MID.t2s2, tournament_id: TID.t2, category_id: CATID.t2_se, round: 1, round_name: 'Semi-Final', entry_a_id: EID.t2e2, entry_b_id: EID.t2e4, court: 4, bracket_position: 1, status: 'completed', winner_entry_id: EID.t2e2, sets: sets([11,9],[11,8]), completed_at: ago(4*H+30*MIN) },
    // Final: Casey v Riley — scheduled
    { id: MID.t2s3, tournament_id: TID.t2, category_id: CATID.t2_se, round: 2, round_name: 'Final',      entry_a_id: EID.t2e1, entry_b_id: EID.t2e2, court: 1, bracket_position: 0, status: 'scheduled', sets: [], scheduled_time: from(1*H) },

    // ── T3 Men's Singles  (single_elimination, in_progress) ──────────────────
    // Semi 1: Sam beats Jordan
    { id: MID.t3s1, tournament_id: TID.t3, category_id: CATID.t3_se, round: 1, round_name: 'Semi-Final', entry_a_id: EID.t3e1, entry_b_id: EID.t3e2, court: 1, bracket_position: 0, status: 'completed',  winner_entry_id: EID.t3e1, sets: sets([11,6],[11,4]), completed_at: ago(4*H) },
    // Semi 2: Taylor v Morgan — in_progress
    { id: MID.t3s2, tournament_id: TID.t3, category_id: CATID.t3_se, round: 1, round_name: 'Semi-Final', entry_a_id: EID.t3e3, entry_b_id: EID.t3e4, court: 2, bracket_position: 1, status: 'in_progress',                        sets: sets([9,7]),       started_at: ago(15*MIN) },
    // Final: Sam v TBD — scheduled
    { id: MID.t3s3, tournament_id: TID.t3, category_id: CATID.t3_se, round: 2, round_name: 'Final',      entry_a_id: EID.t3e1, entry_b_id: null,      court: 1, bracket_position: 0, status: 'scheduled',  sets: [] },

    // ── T4 Mixed Doubles RR  (round_robin, Group A, completed) ───────────────
    // Round 1
    { id: MID.t4r1, tournament_id: TID.t4, category_id: CATID.t4_rr, round: 1, round_name: 'Round 1', group_name: 'Group A', entry_a_id: EID.t4r1, entry_b_id: EID.t4r2, court: 1, bracket_position: 0, status: 'completed', winner_entry_id: EID.t4r1, sets: sets([11,5],[11,7]),          completed_at: ago(30*24*H) },
    { id: MID.t4r2, tournament_id: TID.t4, category_id: CATID.t4_rr, round: 1, round_name: 'Round 1', group_name: 'Group A', entry_a_id: EID.t4r3, entry_b_id: EID.t4r4, court: 2, bracket_position: 1, status: 'completed', winner_entry_id: EID.t4r3, sets: sets([11,9],[11,8]),          completed_at: ago(30*24*H) },
    // Round 2
    { id: MID.t4r3, tournament_id: TID.t4, category_id: CATID.t4_rr, round: 2, round_name: 'Round 2', group_name: 'Group A', entry_a_id: EID.t4r1, entry_b_id: EID.t4r3, court: 1, bracket_position: 0, status: 'completed', winner_entry_id: EID.t4r1, sets: sets([11,8],[11,6]),          completed_at: ago(30*24*H) },
    { id: MID.t4r4, tournament_id: TID.t4, category_id: CATID.t4_rr, round: 2, round_name: 'Round 2', group_name: 'Group A', entry_a_id: EID.t4r2, entry_b_id: EID.t4r4, court: 2, bracket_position: 1, status: 'completed', winner_entry_id: EID.t4r2, sets: sets([11,7],[11,5]),          completed_at: ago(30*24*H) },
    // Round 3
    { id: MID.t4r5, tournament_id: TID.t4, category_id: CATID.t4_rr, round: 3, round_name: 'Round 3', group_name: 'Group A', entry_a_id: EID.t4r1, entry_b_id: EID.t4r4, court: 1, bracket_position: 0, status: 'completed', winner_entry_id: EID.t4r1, sets: sets([11,3],[11,4]),          completed_at: ago(30*24*H) },
    { id: MID.t4r6, tournament_id: TID.t4, category_id: CATID.t4_rr, round: 3, round_name: 'Round 3', group_name: 'Group A', entry_a_id: EID.t4r2, entry_b_id: EID.t4r3, court: 2, bracket_position: 1, status: 'completed', winner_entry_id: EID.t4r2, sets: sets([11,6],[11,8]),          completed_at: ago(30*24*H) },

    // ── T4 Men's Singles B  (single_elimination, completed) ──────────────────
    { id: MID.t4e1, tournament_id: TID.t4, category_id: CATID.t4_se, round: 1, round_name: 'Semi-Final', entry_a_id: EID.t4e1, entry_b_id: EID.t4e3, court: 1, bracket_position: 0, status: 'completed', winner_entry_id: EID.t4e1, sets: sets([11,7],[11,5]),          completed_at: ago(30*24*H) },
    { id: MID.t4e2, tournament_id: TID.t4, category_id: CATID.t4_se, round: 1, round_name: 'Semi-Final', entry_a_id: EID.t4e2, entry_b_id: EID.t4e4, court: 2, bracket_position: 1, status: 'completed', winner_entry_id: EID.t4e2, sets: sets([11,8],[11,7]),          completed_at: ago(30*24*H) },
    { id: MID.t4e3, tournament_id: TID.t4, category_id: CATID.t4_se, round: 2, round_name: 'Final',      entry_a_id: EID.t4e1, entry_b_id: EID.t4e2, court: 1, bracket_position: 0, status: 'completed', winner_entry_id: EID.t4e1, sets: sets([11,9],[9,11],[11,7]),    completed_at: ago(30*24*H) },

  ], { onConflict: 'id' });
  ok('matches (22)', mErr);

  // ── 12. Announcements ────────────────────────────────────────────────────
  const { error: aErr } = await admin.from('announcements').upsert([
    {
      id: 'aa000001-0000-0000-0000-000000000001',
      tournament_id: TID.t2, sent_by: PID.alex, urgency: 'normal',
      message: 'Court 3 is temporarily out of service. Please use courts 1, 2 and 4 only.',
      dismissed_at: null, sent_at: ago(30*MIN),
    },
    {
      id: 'aa000002-0000-0000-0000-000000000002',
      tournament_id: TID.t2, sent_by: PID.alex, urgency: 'urgent',
      message: '⚠ URGENT: All players report to Court 1 for the opening ceremony NOW.',
      dismissed_at: ago(2*H), sent_at: ago(3*H),
    },
  ], { onConflict: 'id' });
  ok('announcements (2)', aErr);

  // ── 13. Display state ────────────────────────────────────────────────────
  //  Each tournament display screen will open on a different interesting slide.
  const { error: dsErr } = await admin.from('display_state').upsert([
    { tournament_id: TID.t1, current_slide: 'upcoming_matches' },
    { tournament_id: TID.t2, current_slide: 'group_standings'  },
    { tournament_id: TID.t3, current_slide: 'live_bracket'     },
    { tournament_id: TID.t4, current_slide: 'wrap_up'          },
  ], { onConflict: 'tournament_id' });
  ok('display state', dsErr);

  // ── Done! ─────────────────────────────────────────────────────────────────
  console.log(`
✅  Seed complete!

🔑  Login with any account (password: Password123!)
    alex@playoffe.dev   — organiser, owns both clubs
    sam@playoffe.dev    — top-ranked player (4.25 rating)
    jordan@playoffe.dev — player
    riley@playoffe.dev  — player

📌  Interesting URLs to visit:
    /events                                  — public browse (4 tournaments)
    /events/winter-classic-2026              — Winter Classic  (registration open, pending queue)
    /events/summer-open-2026                 — Summer Open     (in progress, live scores)
    /tournaments/winter-classic-2026/registrations        — Approval queue (5 pending/waitlisted)
    /tournaments/summer-open-2026/categories/mens-singles-a  — RR draw (Sam vs Taylor live)
    /tournaments/summer-open-2026/categories/womens-singles-open  — SE bracket (final scheduled)
    /tournaments/winter-classic-2026/edit    — Edit tournament + auto_approve toggle

🖥️  Display screens:
    /display/SUMMER26   — Group Standings slide (live round-robin)
    /display/MELB2026   — Live Bracket slide (semi in progress)
    /display/NEWYEAR5   — Wrap-Up slide (completed tournament)
    /display/WINTER26   — Upcoming Matches slide

👤  Player profiles:
    /p/sam-chen         — Top player profile
    /p/alex-rivera      — Organiser profile
`);
}

seed().catch(err => { console.error('\n💥 Seed failed:', err); process.exit(1); });
