# Handoff — feature/draws-ui-fixes

## Branch state
- Branch `feature/draws-ui-fixes`, up to date with origin (last push `89ee1b5`).
- Dev server running on port 3000 (preview server name `playoffe-web`).
- Working tree clean.

## Recent commits
- `89ee1b5` Add results preview before finalizing and fix podium derivation for group-stage knockouts
- `a33ed8d` Hide group-stage participant lists, warn before adjusting started draws, and hide completed matches from schedule
- `465c2b9` Improve manual knockout builder: bracket reset, pool retention, ordering
- `48671f8` Pair knockout opponents across groups and lock completed tournaments
- `6a0a5a2` Add knockout bracket reset and category stage badges

## What was done this session
1. Created 12 entries for category **Beginner Mixed Doubles** (`d61b036e-e900-4dd4-bd53-62fac9e9a5ff`) under tournament **The Pickle Jar - Mixed Doubles** (`49f29cb3-b29b-48f5-bb16-49d3cc57481c`), paired from players `d1000000-...-025` through `048`.
2. Completed all group stage, QF, SF, 3rd-place, and Final matches for Beginner Mixed Doubles via direct SQL (`UPDATE matches SET status='completed', sets=..., winner_entry_id=...`). Note: `sets` must use `[{"set_number":1,"score_a":11,"score_b":7}]` format (not `{"a":...,"b":...}`) or standings show NaN.
3. **Adjust draw warning**: clicking "Adjust draw" now shows a confirmation warning if any match has started/completed ([DrawSection.tsx](apps/web/src/components/tournaments/DrawSection.tsx)).
4. **Schedule page**: now only queries `status='scheduled'` matches, hiding started/completed matches ([schedule/page.tsx](apps/web/src/app/tournaments/[id]/schedule/page.tsx)).
5. **GroupSection simplification**: removed the redundant per-group participant standings list from `BracketView.tsx` (since `StandingsTable` already shows "Group Standings"), kept only round-by-round match list; adjust-mode swap UI preserved.
6. **Finalize results preview**: `FinalizeCategoryButton.tsx` now previews the podium (champion/runner-up/3rd) via new `previewCategoryResultsAction` before confirming `finalizeCategoryResultsAction` ([categories.ts](apps/web/src/lib/actions/categories.ts)).
7. **Knockout standings fix**: in `getKnockoutBuilderStateAction` (draws.ts), once the "Final" match is completed, its winner/runner-up are forced to ranks #1/#2 of `overallStandings` regardless of other tiebreakers.
8. **Podium derivation fix**: `deriveCategoryResults` in categories.ts now resolves group_stage_knockout results from the explicit "Final" + "3rd place playoff" matches when a Final exists, instead of raw win-count standings (fixes 3rd-place/runner-up swap bug).

## Known outstanding item (not yet done, not re-requested)
- For category **Open Mixed Doubles** (`9266e468-afdf-4fb3-be58-7d61a022618c`), the 3rd place playoff match (id `c2623529-30f6-455c-a65c-5a3306a70034`, round 7) currently pairs the **QF losers** (`d7e20d0f-3285-4b83-9b27-f39a08fd0246`, `4c240ca4-b0d2-4b0e-a19e-97cb100e314d`) instead of the **SF losers** (`52d18488-6a64-422c-8017-5e5da2bc4566`, `584d12be-e5a6-4d19-901e-425340d32d1e`). The Knockout Builder UI now permits creating the correct match (pool retains losers), but this hasn't been corrected yet.

## Useful references
- Typecheck: `cd "C:/Projects/Repositories/pratik/pickleball-platform/apps/web" && npx tsc -p tsconfig.json --noEmit`
- DB access: `docker exec -i supabase_db_pickleball-platform psql -U postgres -d postgres -c "..."`
- Login: `alex@playoffe.dev` / `Password123!` (super_admin)
- `STAGE_HIERARCHY` (chronological knockout stage order) duplicated in `KnockoutBuilder.tsx` and `BracketView.tsx`: `['Round of 32', 'Round of 16', 'Quarter-final', 'Semi-final', '3rd place playoff', 'Final']`
