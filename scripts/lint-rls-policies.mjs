#!/usr/bin/env node
// Static lint over supabase/migrations/*.sql — flags any policy that
// (after replaying every migration in order, the same way `supabase db
// reset` would) ends up FOR INSERT/UPDATE/DELETE/ALL and resolves to `true`
// with no role/ownership restriction.
//
// This is the exact mistake found in a 2026-06 security audit: several
// policies were named "*_service_write" under the assumption that the name
// alone restricted them to the backend's service-role client. It doesn't —
// the service role bypasses RLS entirely and needs no policy at all. A
// policy with no `TO <role>` clause applies to the Postgres `public`
// pseudo-role, i.e. every role including unauthenticated `anon`.
//
// Replays CREATE POLICY / DROP POLICY across all migrations (in filename
// order, same as Supabase applies them) so a policy fixed by a later
// migration doesn't show up as a violation here.
//
// Run: node scripts/lint-rls-policies.mjs
// Exits non-zero (and lists every violation) if any remain in the final state.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(import.meta.dirname, '..', 'supabase', 'migrations');

const CREATE_RE = /CREATE POLICY\s+"([^"]+)"\s+ON\s+([\w.]+)\s+FOR\s+(INSERT|UPDATE|DELETE|ALL)\s*([\s\S]*?);/gi;
const DROP_RE = /DROP POLICY\s+(?:IF EXISTS\s+)?"([^"]+)"\s+ON\s+([\w.]+)\s*;/gi;

const SAFE_ROLE_RE = /\bTO\s+(service_role|authenticated)\b/i;
const SAFE_CONDITION_RE = /auth\.uid\(\)|auth\.role\(\)\s*=\s*'service_role'|is_club_manager\(|EXISTS\s*\(/i;

function isViolation(body) {
  // Explicit non-public role scoping combined with a real check is fine.
  if (SAFE_ROLE_RE.test(body) && SAFE_CONDITION_RE.test(body)) return false;
  // A real ownership/permission check anywhere in USING/WITH CHECK is fine,
  // regardless of role scoping (e.g. `auth.uid() = player_id`).
  if (SAFE_CONDITION_RE.test(body)) return false;

  const hasTrueCondition = /\b(USING|WITH CHECK)\s*\(\s*true\s*\)/i.test(body);
  const hasNoCondition = !/USING|WITH CHECK/i.test(body);
  return hasTrueCondition || hasNoCondition;
}

const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();

// key = `${table}::${policyname}` → policy info, or absent if dropped/never created
const liveByKey = new Map();

for (const file of files) {
  const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');

  // Process drops and creates in the order they appear in this file —
  // collect both with their index so interleaved DROP-then-CREATE (the
  // common "fix" pattern) replays correctly.
  const events = [];
  let m;
  CREATE_RE.lastIndex = 0;
  while ((m = CREATE_RE.exec(sql)) !== null) {
    events.push({ index: m.index, type: 'create', name: m[1], table: m[2], cmd: m[3], body: m[4], file });
  }
  DROP_RE.lastIndex = 0;
  while ((m = DROP_RE.exec(sql)) !== null) {
    events.push({ index: m.index, type: 'drop', name: m[1], table: m[2] });
  }
  events.sort((a, b) => a.index - b.index);

  for (const e of events) {
    const key = `${e.table}::${e.name}`;
    if (e.type === 'drop') {
      liveByKey.delete(key);
    } else {
      liveByKey.set(key, e);
    }
  }
}

const violations = [...liveByKey.values()].filter((p) => isViolation(p.body));

if (violations.length > 0) {
  console.error('✗ Found RLS policies that grant public write access with no ownership check:\n');
  for (const v of violations) {
    console.error(`  ${v.file}: "${v.name}" ON ${v.table} FOR ${v.cmd}`);
  }
  console.error(
    '\nA policy with no role restriction applies to every Postgres role, including\n' +
    'unauthenticated `anon` — `USING (true)` means "anyone, no login required".\n' +
    'If this is meant to be backend-only: the service-role client bypasses RLS\n' +
    'entirely and needs no policy — just remove it. If real users should write\n' +
    'here, scope it with a real check (auth.uid() = owner_column, is_club_manager(...), etc).',
  );
  process.exit(1);
}

console.log(`✓ No public-write RLS policy violations found (${files.length} migration files scanned, ${liveByKey.size} live policies in final state).`);
