-- ── PLAYOFFE RLS Audit ────────────────────────────────────────────────────────
-- Run this against staging or prod to surface RLS gaps before launch.
-- Usage: supabase db execute --project-ref <ref> --file supabase/audit/rls-audit.sql
-- Or paste into Supabase Studio SQL editor.

-- ── 1. Tables with RLS DISABLED (critical — anyone can read/write) ────────────
SELECT
  schemaname,
  tablename,
  'RLS DISABLED' AS issue
FROM pg_tables
WHERE schemaname = 'public'
  AND rowsecurity = false
ORDER BY tablename;

-- ── 2. Tables with RLS enabled but ZERO policies (also critical) ──────────────
SELECT
  t.tablename,
  'RLS ON but no policies' AS issue,
  t.rowsecurity
FROM pg_tables t
LEFT JOIN pg_policies p ON p.tablename = t.tablename AND p.schemaname = 'public'
WHERE t.schemaname = 'public'
  AND t.rowsecurity = true
  AND p.policyname IS NULL
ORDER BY t.tablename;

-- ── 3. Full policy inventory — all tables with their policies ─────────────────
SELECT
  t.tablename,
  t.rowsecurity                                           AS rls_enabled,
  COUNT(p.policyname)                                     AS policy_count,
  STRING_AGG(p.policyname || ' (' || p.cmd || ')', ', '
             ORDER BY p.policyname)                       AS policies
FROM pg_tables t
LEFT JOIN pg_policies p
  ON p.tablename  = t.tablename
 AND p.schemaname = 'public'
WHERE t.schemaname = 'public'
GROUP BY t.tablename, t.rowsecurity
ORDER BY t.rowsecurity ASC, t.tablename;

-- ── 4. Policies using PERMISSIVE + no WITH CHECK (insert/update risk) ─────────
SELECT
  tablename,
  policyname,
  cmd,
  permissive,
  qual   AS using_expr,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND permissive = 'PERMISSIVE'
  AND cmd IN ('INSERT', 'UPDATE', 'ALL')
  AND with_check IS NULL
ORDER BY tablename, policyname;

-- ── 5. Policies that grant access to ALL roles (potential over-permissiveness) ─
SELECT
  tablename,
  policyname,
  cmd,
  roles,
  qual AS using_expr
FROM pg_policies
WHERE schemaname = 'public'
  AND (roles = '{public}' OR roles = '{}')
ORDER BY tablename, policyname;

-- ── 6. Storage bucket RLS check ───────────────────────────────────────────────
SELECT
  b.name        AS bucket,
  b.public,
  COUNT(p.name) AS storage_policies
FROM storage.buckets b
LEFT JOIN pg_policies p
  ON p.tablename  = 'objects'
 AND p.schemaname = 'storage'
 AND p.qual ILIKE '%' || b.name || '%'
GROUP BY b.name, b.public
ORDER BY b.name;

-- ── 7. Expected RLS summary (compare against this) ───────────────────────────
-- Every table below should show rls_enabled=true and policy_count >= 1:
--
-- players                — select own, update own
-- tournaments            — select public, insert/update club managers
-- tournament_categories  — select public, insert/update tournament managers
-- tournament_entries     — select public, insert own (registration)
-- matches                — select public, update referees/admins
-- social_connections     — select/update own player only
-- social_post_log        — select own (player_id or club_id)
-- club_social_connections — select/update club managers only
-- feature_flags          — select authenticated, insert/update superadmin only
-- notifications          — select own, update own
-- audit_log              — select superadmin only
-- app_metadata           — select own
