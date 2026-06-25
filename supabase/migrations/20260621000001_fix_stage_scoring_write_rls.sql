-- category_stage_scoring's write policies only checked auth.role() =
-- 'authenticated', meaning ANY logged-in user — not just the club managing
-- the tournament — could insert/update/delete scoring overrides for any
-- category via a direct PostgREST call. Scope writes to club managers of the
-- tournament that owns the category, matching the is_club_manager() pattern
-- used everywhere else in the schema.

DROP POLICY IF EXISTS "css_insert" ON category_stage_scoring;
DROP POLICY IF EXISTS "css_update" ON category_stage_scoring;
DROP POLICY IF EXISTS "css_delete" ON category_stage_scoring;

CREATE POLICY "css_insert" ON category_stage_scoring FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM tournament_categories tc
    JOIN tournaments t ON t.id = tc.tournament_id
    WHERE tc.id = category_stage_scoring.category_id
      AND is_club_manager(t.club_id)
  )
);

CREATE POLICY "css_update" ON category_stage_scoring FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM tournament_categories tc
    JOIN tournaments t ON t.id = tc.tournament_id
    WHERE tc.id = category_stage_scoring.category_id
      AND is_club_manager(t.club_id)
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM tournament_categories tc
    JOIN tournaments t ON t.id = tc.tournament_id
    WHERE tc.id = category_stage_scoring.category_id
      AND is_club_manager(t.club_id)
  )
);

CREATE POLICY "css_delete" ON category_stage_scoring FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM tournament_categories tc
    JOIN tournaments t ON t.id = tc.tournament_id
    WHERE tc.id = category_stage_scoring.category_id
      AND is_club_manager(t.club_id)
  )
);
