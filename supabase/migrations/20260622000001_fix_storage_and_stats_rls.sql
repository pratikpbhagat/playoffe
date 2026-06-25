-- Three RLS/storage-policy gaps found during a follow-up security sweep:
--
-- 1. global_stats had a policy named "stats_service_write" but scoped to
--    `public` (= every role, including unauthenticated `anon`) with
--    `USING (true)` — meaning anyone holding the public anon key could
--    insert/update/delete ANY player's rating row directly via the
--    Supabase client SDK, no login required. All real writes already go
--    through the admin (service-role) client, which bypasses RLS and needs
--    no policy at all — so this policy was pure unintended public access.
--
-- 2. The `avatars` storage bucket's update/delete policies only checked
--    `bucket_id = 'avatars'`, with no ownership check. Avatars are stored
--    at a predictable `${user.id}/avatar.ext` path (profile.ts), so any
--    authenticated user could overwrite or delete any other user's avatar.
--    (These policies weren't tracked in any prior migration — recreating
--    them here as the canonical, version-controlled definition.)
--
-- 3. The `social-graphics` bucket had an INSERT policy named "service role
--    write" but, same mistake as #1, scoped to `public` — unauthenticated
--    storage write access. Currently unused by any app code; locking it
--    down entirely (service-role writes don't need a policy).

-- ── 1. global_stats: remove the public write-all policy ──────────────────────
DROP POLICY IF EXISTS "stats_service_write" ON global_stats;

-- ── 2. avatars bucket: scope update/delete to the owning user ────────────────
DROP POLICY IF EXISTS "avatars_auth_update" ON storage.objects;
DROP POLICY IF EXISTS "avatars_auth_delete" ON storage.objects;

CREATE POLICY "avatars_auth_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "avatars_auth_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Also tighten upload (INSERT) the same way — it previously had no USING/
-- WITH CHECK ownership scoping either (any authenticated user could upload
-- into another user's folder, e.g. to plant a file at <victim-id>/avatar.jpg).
DROP POLICY IF EXISTS "avatars_auth_upload" ON storage.objects;
CREATE POLICY "avatars_auth_upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ── 3. social-graphics bucket: remove public insert ───────────────────────────
DROP POLICY IF EXISTS "social_graphics: service role write" ON storage.objects;
