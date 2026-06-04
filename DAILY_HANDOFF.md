# PLAYOFFE — Daily Handoff
**Date:** 4 June 2026
**Branch:** `master`
**Last Commit:** `d5cb787` — feat: add dev environment — Terraform config + CI/CD workflow

---

## Project Summary

**PLAYOFFE** is a full-stack pickleball tournament management platform covering the complete tournament lifecycle: club management, registration, draw generation, live scoring, venue display, player network, social media automation, and AI-powered scheduling.

**Repo:** `C:\Projects\Repositories\pratik\pickleball-platform`
**GitHub:** https://github.com/pratikpbhagat/playoffe

### Technology Stack
| Layer | Technology |
|---|---|
| Frontend | Next.js 14 App Router, React 18, TypeScript, Tailwind CSS |
| Backend | Next.js Server Actions, Supabase (Postgres + Auth + Storage + Realtime) |
| Workers | @pickleball/workers — BullMQ + Redis (Node.js ESM, ECS Fargate) |
| AI | Anthropic Claude API (claude-3-5-sonnet-20241022) |
| Graphics | Satori + @resvg/resvg-js (1080×1080 PNG rendering) |
| IaC | Terraform (AWS) |
| Hosting | Vercel (frontend) + AWS ECS Fargate (workers) |
| Package Manager | pnpm 10 (workspace monorepo) |

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
| Phase 11 — Social Media Pipeline + AI Scheduling | ✅ Complete |
| Phase 12 — Infrastructure & Deployment | ✅ Code complete — **pending real-world provisioning** |

---

## Session Summary (4 June 2026)

### What Was Done
1. **Merged `feature/smart-scheduling` → `master`** — all Phases 1–11 now on master
2. **Pre-Phase 12 bug fixes:**
   - `workers/src/workers/podium.worker.ts` — fixed `social_post_log` missing `platform` field; now inserts one row per platform inside the `clubConns` loop (carousel path was also unlogged — fixed)
   - `packages/db/src/database.types.ts` — regenerated from local schema; stripped CLI noise lines
3. **Phase 12 — Infrastructure as Code (Terraform):**
   - `infra/` package with 6 modules: ECR, ECS Fargate, ElastiCache Redis, Secrets Manager, CloudWatch (5 alarms + dashboard), CloudFront CDN
   - Three environment stacks: `dev.tfvars`, `staging.tfvars`, `prod.tfvars`
   - ECS auto-scaling on Redis queue depth, deployment circuit breaker + auto-rollback
4. **Phase 12 — CI/CD (GitHub Actions):**
   - `pr-checks.yml` — TS + tests + Vercel preview URL on every PR
   - `dev-deploy.yml` — push to `develop` branch → full dev environment deploy
   - `staging-deploy.yml` — push to `master` → full staging deploy (no approval)
   - `prod-deploy.yml` — push `v*.*.*` tag → manual approval gate → prod deploy + GitHub Release
5. **Phase 12 — Security:**
   - `apps/web/next.config.mjs` — CSP, HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy
   - `apps/web/src/middleware.ts` — sliding-window rate limiting (10/30/120 req/min by route type)
   - `supabase/audit/rls-audit.sql` — detects unprotected tables, missing policies, overly permissive grants
6. **Phase 12 — Load Tests (k6):**
   - `tests/load/draw-generation.js` — 32-player draw gen, ramp to 20 concurrent, p95 < 3s threshold
   - `tests/load/scoring-concurrency.js` — 15 simultaneous referees, zero-conflict threshold
   - `tests/load/workers-throughput.js` — queue burst 50 concurrent, measures jobs/sec + auto-scale

---

## Deployment Pipeline (how it works)

```
Local dev  ──────────────── supabase start + docker redis + pnpm dev
    │
PR opened  ──────────────── Vercel ephemeral preview URL (dev Supabase, no workers)
    │
push → develop  ─────────── dev.playoffe.com  (ECS workers, dev Supabase, t3.micro Redis)
    │
push → master  ──────────── staging.playoffe.com  (ECS workers, staging Supabase, t3.micro Redis)
    │
git tag v*.*.* + approve ── playoffe.com  (ECS 2 workers, prod Supabase, t3.small Redis)
```

Each environment has its own:
- Supabase project (isolated DB, Auth, Storage)
- ECS Fargate cluster + service
- ElastiCache Redis
- Secrets Manager path (`/playoffe/{env}/*`)

---

## What Is NOT Done Yet (requires real-world provisioning)

The code is all written and committed. The next session must complete the actual provisioning:

### Phase A — External Accounts (~1 hour)
- [ ] **AWS IAM user** — create `playoffe-deploy` user, attach `AdministratorAccess`, generate Access Key
- [ ] **Supabase — 3 projects** — create `playoffe-dev`, `playoffe-staging`, `playoffe-prod`; save project refs, anon keys, service role keys, DB passwords
- [ ] **Supabase Personal Access Token** — supabase.com/dashboard/account/tokens
- [ ] **Vercel** — `cd apps/web && vercel login && vercel link`; create token at vercel.com/account/tokens
- [ ] **Domain DNS** — add `dev.`, `staging.` subdomains in Vercel + DNS records at registrar

### Phase B — Config Files (~20 minutes)
- [ ] Fill VPC ID + subnet IDs into `infra/environments/dev.tfvars`, `staging.tfvars`, `prod.tfvars`
- [ ] Fill `supabase_storage_url` in each tfvars (format: `https://<ref>.supabase.co/storage/v1/object/public/social-graphics`)

### Phase C — Terraform Deploy (~30 minutes)
- [ ] `terraform init` in `infra/`
- [ ] `terraform apply -var-file="environments/dev.tfvars"` (set all `TF_VAR_*` env vars first)
- [ ] `supabase db push --project-ref <dev-ref>`
- [ ] Create `social-graphics` storage bucket on dev Supabase project (Dashboard → Storage)
- [ ] Repeat for staging (`terraform apply -var-file="environments/staging.tfvars"`)
- [ ] **Hold prod** — deploy prod only after staging is validated

### Phase D — GitHub Secrets (~20 minutes)
Add these to GitHub → repo → Settings → Secrets → Actions:
```
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
SUPABASE_ACCESS_TOKEN
DEV_SUPABASE_PROJECT_REF
DEV_SUPABASE_URL
DEV_SUPABASE_SERVICE_ROLE_KEY
STAGING_SUPABASE_PROJECT_REF
PROD_SUPABASE_PROJECT_REF      ← add when ready for prod
VERCEL_TOKEN
```
- [ ] GitHub → Settings → Environments → `production` → Required reviewers → add yourself

### Phase E — Validate Pipelines (~1 hour)
- [ ] `git checkout -b develop && git push origin develop` — creates develop branch
- [ ] Trivial commit on develop → watch `dev-deploy.yml` run → verify `dev.playoffe.com` live
- [ ] Merge develop → master → watch `staging-deploy.yml` → verify `staging.playoffe.com` live
- [ ] `git tag v0.1.0-rc1 && git push origin v0.1.0-rc1` → approval gate appears → approve → verify deploy

### Phase F — Validate & Load Test Staging
- [ ] Run `supabase/audit/rls-audit.sql` — fix any unprotected tables
- [ ] Verify headers: `curl -I https://staging.playoffe.com` — CSP + HSTS present
- [ ] Run `tests/load/draw-generation.js` — all thresholds pass
- [ ] Run `tests/load/scoring-concurrency.js` — zero conflicts
- [ ] Run `tests/load/workers-throughput.js` — queue drains, ECS auto-scales

### Phase G — First Launch
- [ ] `terraform apply -var-file="environments/prod.tfvars"`
- [ ] `supabase db push --project-ref <prod-ref>`
- [ ] `git tag v1.0.0 && git push origin v1.0.0` → approve → prod live

---

## Key File Locations

| File | Role |
|---|---|
| `infra/README.md` | Complete provisioning guide with all commands |
| `infra/environments/*.tfvars` | Environment configs — fill VPC/subnet IDs before deploying |
| `infra/modules/*/` | Terraform modules (ECR, ECS, ElastiCache, Secrets, CloudWatch, CloudFront) |
| `.github/workflows/` | 4 CI/CD workflows |
| `workers/Dockerfile` | Multi-stage ECS-ready container |
| `workers/src/index.ts` | Worker entry point (graceful shutdown, Redis health check) |
| `apps/web/src/middleware.ts` | Auth guard + rate limiting |
| `apps/web/next.config.mjs` | Security headers |
| `supabase/migrations/` | 21 migration files — applied in order |
| `supabase/audit/rls-audit.sql` | Run before prod to detect RLS gaps |
| `tests/load/*.js` | k6 load tests — run against staging |
| `packages/db/src/database.types.ts` | Generated Supabase types — regenerate with `supabase gen types typescript --local > packages/db/src/database.types.ts` |

---

## Feature Flags (current state)

| Flag | State | Notes |
|---|---|---|
| `social_media_organiser` | ✅ ON | Club owners: draw/schedule/podium sharing |
| `social_media_player` | ❌ OFF | Player auto-posting — disabled for launch |
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
cd apps/web && (unset ANTHROPIC_API_KEY && npm run dev)   # separate terminal
cd workers && pnpm dev                                     # separate terminal
```

**Local URLs:**
- App: http://localhost:3000
- Supabase Studio: http://localhost:54323
- Mailpit (email): http://localhost:54325

**Test accounts:**
- `alex@playoffe.dev` / `TestPass123!` — Super Admin
- `sam@playoffe.dev` / `TestPass123!` — Club Owner (Blue Bird Club)

**Regenerate types after migration:**
```bash
supabase gen types typescript --local > packages/db/src/database.types.ts
# Then strip any CLI noise from line 1 and the last 2 lines if present
```

---

## 🚀 Resume Prompt

> Paste everything below this line into a new Claude Code session to resume instantly.

---

We are building **PLAYOFFE** — a full-stack pickleball tournament management platform.

**Repo:** `C:\Projects\Repositories\pratik\pickleball-platform`
**GitHub:** https://github.com/pratikpbhagat/playoffe
**Branch:** `master`
**Last commit:** `d5cb787` — feat: add dev environment

---

### Recent commits
```
d5cb787 feat: add dev environment — Terraform config + CI/CD workflow
17b5142 feat: Phase 12 — infrastructure, CI/CD, security, load tests
659c57d feat: merge feature/smart-scheduling — Phase 11 complete + pre-Phase 12 fixes
ffa2c7b fix: social_post_log platform field + regenerate Supabase types
```

---

### Phase status
- **Phases 1–11:** Complete ✅
- **Phase 12 (Infrastructure/Deployment):** Code complete ✅ — **provisioning not yet done** ⏳

---

### What Phase 12 code was built (all committed to master)

**Terraform (`infra/`):**
- 6 modules: ECR, ECS Fargate + auto-scaling, ElastiCache Redis, Secrets Manager, CloudWatch (5 alarms), CloudFront CDN
- 3 environment configs: `infra/environments/dev.tfvars`, `staging.tfvars`, `prod.tfvars` — VPC/subnet IDs still need to be filled in

**GitHub Actions (`.github/workflows/`):**
- `pr-checks.yml` — TS + tests + Vercel preview on every PR
- `dev-deploy.yml` — push to `develop` branch → deploys to `dev.playoffe.com`
- `staging-deploy.yml` — push to `master` → deploys to `staging.playoffe.com`
- `prod-deploy.yml` — push `v*.*.*` tag + manual approval → deploys to `playoffe.com`

**Security:** CSP/HSTS headers in `next.config.mjs`, rate limiting in `middleware.ts`, RLS audit SQL in `supabase/audit/rls-audit.sql`

**Load tests:** k6 scripts in `tests/load/` (draw generation, scoring concurrency, workers throughput)

---

### Deployment pipeline
```
local → PR preview (ephemeral) → dev.playoffe.com (develop branch)
     → staging.playoffe.com (master branch)
     → playoffe.com (v*.*.* tag + approval)
```

---

### What needs to happen next (real-world provisioning)

**Phase A — External accounts (~1 hour)**
- AWS IAM user `playoffe-deploy` with Access Key
- 3 Supabase projects: `playoffe-dev`, `playoffe-staging`, `playoffe-prod` — save refs + keys
- Supabase Personal Access Token (for CI migrations)
- Vercel: `cd apps/web && vercel login && vercel link` + create API token
- Domain DNS: add `dev.` and `staging.` subdomains

**Phase B — Fill config files (~20 min)**
- VPC ID + 2 subnet IDs into all 3 `infra/environments/*.tfvars`
- `supabase_storage_url` in each tfvars

**Phase C — Terraform deploy (~30 min)**
- `cd infra && terraform init`
- Set all `TF_VAR_*` env vars (14 secrets — see `infra/README.md`)
- `terraform apply -var-file="environments/dev.tfvars"`
- `supabase db push --project-ref <dev-ref>`
- Create `social-graphics` Storage bucket on dev Supabase (Dashboard → Storage, public)
- Repeat for staging — hold prod until staging validated

**Phase D — GitHub secrets (~20 min)**
Add to repo → Settings → Secrets → Actions:
`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `SUPABASE_ACCESS_TOKEN`,
`DEV_SUPABASE_PROJECT_REF`, `DEV_SUPABASE_URL`, `DEV_SUPABASE_SERVICE_ROLE_KEY`,
`STAGING_SUPABASE_PROJECT_REF`, `PROD_SUPABASE_PROJECT_REF`, `VERCEL_TOKEN`

Create GitHub `production` environment with required reviewer (yourself).

**Phase E — Validate pipelines (~1 hour)**
- `git checkout -b develop && git push origin develop`
- Commit on develop → `dev-deploy.yml` → verify `dev.playoffe.com` live
- Merge develop → master → `staging-deploy.yml` → verify `staging.playoffe.com` live
- `git tag v0.1.0-rc1 && git push origin v0.1.0-rc1` → approval gate → approve → verify

**Phase F — Load test + security audit (staging)**
- `supabase/audit/rls-audit.sql` against staging — fix any gaps
- `k6 run tests/load/draw-generation.js` (and scoring + workers scripts)
- All k6 thresholds must pass before proceeding to prod

**Phase G — First launch**
- `terraform apply -var-file="environments/prod.tfvars"`
- `supabase db push --project-ref <prod-ref>`
- Create `social-graphics` bucket on prod Supabase
- `git tag v1.0.0 && git push origin v1.0.0` → approve → live

---

### Dev setup (local)
```bash
supabase start
docker start pickleball-redis
cd apps/web && (unset ANTHROPIC_API_KEY && npm run dev)
cd workers && pnpm dev
```

**Test accounts:**
- `alex@playoffe.dev` / `TestPass123!` — Super Admin
- `sam@playoffe.dev` / `TestPass123!` — Club Owner (Blue Bird Club)

---

### Key context
- Monorepo: pnpm workspaces — `apps/web`, `workers/`, `packages/db`, `packages/draw-engine`, `packages/rating`, `packages/shared`, `packages/ui`
- Workers use BullMQ queue names: `social.graphic`, `social.post`, `social.podium` (dots, not colons — BullMQ v5 restriction)
- `supabase gen types` output must have first line (`Connecting to db...`) and last 2 lines (CLI update notice) stripped manually
- `ANTHROPIC_API_KEY` — always unset system env before `npm run dev` (system empty var overrides `.env.local`)
- `pnpm approve-builds` required after fresh install (sharp + @resvg/resvg-js native builds)

Please read `DAILY_HANDOFF.md` in the repo root for the full session context, then confirm what you understand and ask which provisioning phase to start with.
