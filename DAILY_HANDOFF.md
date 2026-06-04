# PLAYOFFE — Daily Handoff
**Generated:** 4 June 2026, 00:58 IST
**Branch:** `feature/smart-scheduling`
**Last Commit:** `0569b2a9be0fb3a2c94515429fe59c07843e0625`

> This file is generated at the end of each Claude Code session. To resume tomorrow, copy the 🚀 Resume Prompt at the bottom and paste it into a new Claude Code session.

---

## Today's Work (3 June – 4 June 2026)

### Commits (most recent first)
```
0569b2a feat: feature flags for AI schedule assistant + rankings nav
a8412da fix(ai-panel): fixed-overlay sidebar — no longer compresses schedule UI
de203a8 feat: AI Assistant always visible — shows setup instructions when key is missing
66a5c92 fix: remove all non-async exports from 'use server' scheduling.ts
b17b2ee fix: move sync helpers out of 'use server' file to satisfy Next.js constraint
cea020f feat(smart-schedule): AI-assisted tournament scheduling
3fba1d8 feat: Phase 11 — complete social media pipeline (11A + 11B + 11C)
af3b0fe refactor(carousel): redesigned group slide — tournament first, doubles names, no empty space
3e8f30e feat: group stage draw carousel post
6f677d6 feat: dual social media feature flags (organiser + player)
452a5f7 feat(phase-11): complete all remaining Phase 11 social media items
538b483 test(phase-11b): 10/10 e2e stub tests for social media pipeline
84b6e06 fix: social media tab not appearing after feature flag is enabled
4a3b9ae fix: rename queue names from social:* to social.* (BullMQ v5 disallows colons)
4b39d36 feat(phase-11b): social media backend pipeline
```

### Summary of today's session
- ✅ **Phase 11B complete** — @pickleball/workers package: BullMQ + Redis, Satori graphics, Instagram/Facebook/X API clients, 10/10 e2e stub tests, Dockerfile
- ✅ **Phase 11 remaining complete** — preview UI, push notifications, category/tournament triggers, rank/streak captions, WhatsApp share links, club social connections
- ✅ **Group stage draw carousel** — one 1080×1080 slide per group, doubles show both players' names, Instagram carousel / Facebook multi-photo / X multi-image (4 max)
- ✅ **Dual social media feature flags** — `social_media_organiser` (enabled) + `social_media_player` (disabled for initial launch)
- ✅ **Draw staleness detection** — `replaceDrawEntryAction` for targeted slot replacement, amber warning on registrations page
- ✅ **AI-assisted scheduling** — `generateSmartScheduleAction` (groups on one court sequential, knockouts after groups), `ScheduleSettingsModal`, conflict detection, `updateCourtCountAction`
- ✅ **Claude AI scheduling assistant** — `ScheduleAIPanel` fixed overlay sidebar (doesn't compress main UI), `callScheduleAssistantAction` with Claude claude-3-5-sonnet + `update_schedule` tool use
- ✅ **Feature flags** — `ai_schedule_assistant` (super admins bypass), `rankings` (super admins bypass), both gated in AppNav + MobileNav
- ✅ **`PLAYOFFE_Development_Handoff.docx`** — comprehensive Word document in repo root (25KB)
- ✅ **PLAYOFFE Daily Handoff routine** — created at claude.ai/code/routines (manual mode, ID: trig_01BDwJPWXi8nht28cpcUe5bX)

---

## Phase Status
| Phase | Status |
|---|---|
| Phase 1 — Platform Layer & Auth | ✅ Complete |
| Phase 2 — Tournament Management | ✅ Complete |
| Phase 3 — Draw Generation | ✅ Complete |
| Phase 4 — Live Scoring | ✅ Complete |
| Phase 5 — Player Network & Profiles | ✅ Complete |
| Phase 6 — Rankings | ✅ Complete |
| Phase 7 — Venue Display Screen | ✅ Complete |
| Phase 8 — Feed & Social | ✅ Complete |
| Phase 9 — Notifications | ✅ Complete |
| Phase 10 — Superadmin & RBAC | ✅ Complete |
| Phase 11A — Social Media OAuth UI | ✅ Complete |
| Phase 11B — Social Media Pipeline | ✅ Complete |
| Phase 11 Remaining — AI Scheduling | ✅ Complete |
| **Phase 12 — Infrastructure & Deployment** | **⏳ NEXT** |

---

## Phase 12 — What's Next
1. **AWS ECS Fargate** — `workers/Dockerfile` is ready; needs Task Definition, ECR repo, auto-scaling on Redis queue depth
2. **AWS ElastiCache** — replace local Redis; `REDIS_URL=rediss://<cluster>.cache.amazonaws.com:6379`
3. **AWS Secrets Manager** — move all `.env` secrets; encrypt `social_connections.access_token` + `refresh_token` columns
4. **CloudWatch Alerts** — queue depth >100, worker error rate, >3 consecutive social post failures per platform
5. **GitHub Actions CI/CD** — TS check + `pnpm test` on PR; Docker build+push to ECR on merge; ECS rolling deploy
6. **Supabase Production** — `supabase link`, `db push`, RLS audit, custom SMTP via SES
7. **Vercel / Frontend Hosting** — custom domain, CloudFront CDN for `social-graphics` Storage bucket
8. **Load Testing** — k6/Artillery for draw gen (32 players), scoring concurrency, workers throughput
9. **Security Audit** — OWASP Top 10, RLS coverage, OAuth token encryption, rate limiting

---

## Known Issues (fix during Phase 12)
1. **`social_post_log` missing `platform` field for organiser posts** — podium worker's log insert doesn't include the required `platform` column. Graphics ARE rendered and uploaded correctly; only the audit log row fails silently. Fix: insert one row per platform in `clubConns` loop in `podium.worker.ts`
2. **Supabase TypeScript types lag** — several newer tables use `(supabase as any)` casts. Fix: `supabase gen types typescript --local > packages/db/src/database.types.ts`
3. **`pnpm approve-builds`** — required after fresh install for `sharp` + `@resvg/resvg-js` native builds
4. **`ANTHROPIC_API_KEY` system env override** — empty system env var overrides `.env.local`. Always start dev with: `(unset ANTHROPIC_API_KEY && npm run dev)`

---

## Feature Flags (current state)
| Flag | State | Notes |
|---|---|---|
| `social_media_organiser` | ✅ ON | Club owners: draw/schedule/podium sharing |
| `social_media_player` | ❌ OFF | Player auto-posting — disabled for initial launch |
| `ai_schedule_assistant` | ✅ ON | AI scheduling chat; super admins always bypass |
| `rankings` | ✅ ON | Rankings nav link; super admins always bypass |
| `player_network` | ✅ ON | Social feed, follow, messaging |
| `ai_caption_generation` | ✅ ON | Claude AI captions for social posts |
| `player_self_reporting` | ❌ OFF | Player self-reported scores |

---

## Dev Setup (local)
```bash
supabase start
docker start pickleball-redis
cd apps/web && (unset ANTHROPIC_API_KEY && npm run dev)
cd workers && pnpm dev          # separate terminal
cd workers && pnpm test          # requires Redis + Supabase running
```

**Dev URLs:**
- App: http://localhost:3000
- Supabase Studio: http://localhost:54323
- Mailpit (email): http://localhost:54325

**Test accounts:**
- `alex@playoffe.dev` / `TestPass123!` — Super Admin
- `sam@playoffe.dev` / `TestPass123!` — Club Owner (Blue Bird Club)

---

## Key Files
| File | Role |
|---|---|
| `PLAYOFFE_Development_Handoff.docx` | Full architecture doc — read this to onboard |
| `apps/web/src/lib/actions/scheduling.ts` | Smart scheduling algorithm + court management |
| `apps/web/src/lib/scheduling-utils.ts` | Pure helpers (NOT `'use server'`) — conflict detection, duration calc |
| `apps/web/src/lib/actions/ai-schedule.ts` | Claude AI scheduling assistant (streaming) |
| `apps/web/src/components/tournaments/ScheduleEditor.tsx` | Redesigned schedule UI |
| `apps/web/src/components/tournaments/ScheduleAIPanel.tsx` | Fixed overlay AI chat panel |
| `workers/src/workers/graphic.worker.ts` | Renders + uploads social graphics |
| `workers/src/workers/post.worker.ts` | Posts to Instagram/Facebook/X |
| `workers/src/workers/podium.worker.ts` | Organiser posts (has known `platform` field bug) |
| `workers/src/platforms/index.ts` | Unified `postToPlatform` with carousel support |
| `workers/src/test/e2e-stub.ts` | 10 stub tests — run with `pnpm test` |
| `workers/Dockerfile` | ECS Fargate ready — multi-stage, non-root |
| `apps/web/src/lib/features.ts` | `isFeatureEnabled()` with `noStore()` + `React.cache()` |
| `supabase/migrations/` | 20+ migration files — last: `20260609000001_feature_flags_ai_rankings.sql` |

---

## Branches
| Branch | Status |
|---|---|
| `master` | Stable — Phases 1–11 fully merged |
| `feature/smart-scheduling` | Ahead of master — AI scheduling + smart schedule (not yet merged) |

---

## 🚀 Resume Prompt — paste into a new Claude Code session

```
We are building PLAYOFFE — a full-stack pickleball tournament management platform.
Repo: C:\Projects\Repositories\pratik\pickleball-platform
GitHub: https://github.com/pratikpbhagat/playoffe

Branch: feature/smart-scheduling
Last commit: 0569b2a9be0fb3a2c94515429fe59c07843e0625

Recent commits:
0569b2a feat: feature flags for AI schedule assistant + rankings nav
a8412da fix(ai-panel): fixed-overlay sidebar — no longer compresses schedule UI
de203a8 feat: AI Assistant always visible — shows setup instructions when key is missing
66a5c92 fix: remove all non-async exports from 'use server' scheduling.ts
b17b2ee fix: move sync helpers out of 'use server' file to satisfy Next.js constraint
cea020f feat(smart-schedule): AI-assisted tournament scheduling
3fba1d8 feat: Phase 11 — complete social media pipeline (11A + 11B + 11C)

Phase status:
- Phases 1–11: Complete ✅
- Phase 12 (Infrastructure/Deployment): NEXT ⏳

Phase 12 covers:
  12.1 AWS ECS Fargate — workers/Dockerfile ready, needs Task Definition + ECR + auto-scaling
  12.2 AWS ElastiCache — replace local Redis with managed cluster
  12.3 AWS Secrets Manager — move all .env secrets, encrypt OAuth tokens in DB
  12.4 CloudWatch Alerts — queue depth, worker errors, post failure rate
  12.5 GitHub Actions CI/CD — PR checks (TS + tests), Docker build+push, ECS rolling deploy
  12.6 Supabase Production — supabase link, db push, RLS audit, custom SMTP
  12.7 Vercel hosting — custom domain, CloudFront CDN for storage bucket
  12.8 Load Testing — draw gen, scoring concurrency, workers throughput
  12.9 Security Audit — OWASP, RLS coverage, rate limiting

Before starting Phase 12, fix these known issues:
  1. social_post_log missing platform field for organiser posts (podium.worker.ts — insert per platform)
  2. Regenerate Supabase types: supabase gen types typescript --local > packages/db/src/database.types.ts

Dev setup:
  supabase start
  docker start pickleball-redis
  cd apps/web && (unset ANTHROPIC_API_KEY && npm run dev)
  cd workers && pnpm dev

Context documents in repo root:
  - PLAYOFFE_Development_Handoff.docx — full architecture, all features, env vars, migration list
  - DAILY_HANDOFF.md — this file, latest session summary

Please:
1. Read PLAYOFFE_Development_Handoff.docx and DAILY_HANDOFF.md
2. Run: git log --oneline -10
3. Tell me what you understand about where we left off
4. Recommend the Phase 12 implementation order
5. List any immediate fixes needed before we start
```
