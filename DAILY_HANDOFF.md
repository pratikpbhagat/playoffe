# PLAYOFFE — Daily Handoff
**Generated:** 4 June 2026
**Branch:** `master`
**Last Commit:** Phase 12 complete — ready for first round of testing

---

## Today's Work (4 June 2026)

### Summary
- ✅ **Merged `feature/smart-scheduling` → `master`** — Phases 1–11 fully on master
- ✅ **Pre-Phase 12 fixes** — `social_post_log` platform field bug fixed, Supabase types regenerated
- ✅ **Phase 12 — Infrastructure & Deployment: COMPLETE**

---

## Phase Status
| Phase | Status |
|---|---|
| Phases 1–11 | ✅ Complete |
| **Phase 12 — Infrastructure & Deployment** | **✅ Complete** |

---

## Phase 12 — What Was Built

### Terraform Infrastructure (`infra/`)
All AWS infrastructure defined as code. One command creates a complete environment.

```
infra/
  terraform.tf              — provider + state backend config
  variables.tf              — all input variables
  main.tf                   — composes all 6 modules
  outputs.tf                — ECR URL, ECS cluster/service names, Redis endpoint
  environments/
    staging.tfvars          — fill VPC IDs, set TF_VAR_* for secrets
    prod.tfvars             — same structure, prod values
  modules/
    ecr/                    — container image registry, lifecycle policies
    secrets/                — Secrets Manager /playoffe/{env}/* (14 secrets)
    elasticache/            — Redis cluster + security group
    ecs/                    — Fargate cluster + task def + service + auto-scaling
    cloudwatch/             — 5 alarms + dashboard
    cloudfront/             — CDN for social-graphics Supabase Storage bucket
  README.md                 — step-by-step setup guide
```

**To deploy staging (first time):**
```bash
cd infra
# Fill VPC/subnet IDs in environments/staging.tfvars
# Set all TF_VAR_* environment variables (see infra/README.md)
terraform init
terraform apply -var-file="environments/staging.tfvars"
# Takes ~10 minutes. Note the outputs for GitHub Actions secrets.
```

### GitHub Actions CI/CD (`.github/workflows/`)

| Workflow | Trigger | What it does |
|---|---|---|
| `pr-checks.yml` | PR opened | TypeScript check + workers tests + Vercel preview URL posted to PR |
| `staging-deploy.yml` | Push to `master` | Supabase migrate → Docker build+push ECR → ECS rolling deploy → Vercel deploy |
| `prod-deploy.yml` | Push `v*.*.*` tag | Manual approval gate → migrate → promote ECR image → ECS deploy → Vercel → GitHub Release |

**To release to production:**
```bash
git tag v1.0.0 -m "First launch"
git push origin v1.0.0
# → GitHub → Actions → approve the deployment
```

### Security (12.9)
- **`apps/web/next.config.mjs`** — CSP, HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy headers on all routes
- **`apps/web/src/middleware.ts`** — Sliding-window rate limiting:
  - `/api/auth/*` → 10 req/min per IP
  - `/api/social/*` → 30 req/min per IP
  - `/api/*` → 120 req/min per IP
- **`supabase/audit/rls-audit.sql`** — Run against staging before prod to detect unprotected tables

### Load Tests (12.8) — `tests/load/`
```bash
# Install k6: brew install k6  (or winget install k6)

k6 run --env BASE_URL=https://staging.playoffe.com --env COOKIE="sb-..." \
  tests/load/draw-generation.js       # 32-player draw gen, 20 concurrent users

k6 run --env BASE_URL=https://staging.playoffe.com --env COOKIE="sb-..." \
  tests/load/scoring-concurrency.js  # 15 simultaneous referees

k6 run --env BASE_URL=https://staging.playoffe.com --env COOKIE="sb-..." \
  tests/load/workers-throughput.js   # queue flood, measures jobs/sec
```

---

## Pre-Launch Checklist

### Infrastructure Setup (one-time)
- [ ] Create Supabase **staging** project → note project ref, URL, keys
- [ ] Create Supabase **prod** project → note project ref, URL, keys
- [ ] `terraform apply -var-file="environments/staging.tfvars"` → all AWS resources created
- [ ] Run `supabase db push --project-ref <staging-ref>` → migrations applied
- [ ] Create `social-graphics` Storage bucket on staging + prod Supabase projects
- [ ] Set Auth redirect URLs in Supabase: `https://staging.playoffe.com/**`
- [ ] Populate all GitHub Actions secrets (see table below)
- [ ] Link Vercel project: `cd apps/web && vercel link`
- [ ] Add staging domain in Vercel: `vercel domains add staging.playoffe.com`
- [ ] Create GitHub `production` environment with required reviewer

### CI/CD Validation
- [ ] Open a test PR → PR checks pass + preview URL commented
- [ ] Merge to master → staging deploy runs end-to-end
- [ ] Push `v0.1.0` tag → approval gate appears → deploy works after approval

### Security
- [ ] Run `supabase/audit/rls-audit.sql` on staging → no tables with RLS disabled
- [ ] Verify headers: `curl -I https://staging.playoffe.com` → CSP, HSTS present
- [ ] Rate limit smoke test: 15 rapid requests to `/api/auth/login` → 429 after 10th

### Load Tests (run against staging)
- [ ] `draw-generation.js` — all thresholds pass (p95 < 3s)
- [ ] `scoring-concurrency.js` — zero conflicts
- [ ] `workers-throughput.js` — ECS auto-scales, queue drains cleanly

---

## GitHub Actions Secrets

| Secret | Where to find it |
|---|---|
| `AWS_ACCESS_KEY_ID` | AWS Console → IAM → Users |
| `AWS_SECRET_ACCESS_KEY` | AWS Console → IAM → Users |
| `SUPABASE_ACCESS_TOKEN` | supabase.com/dashboard/account/tokens |
| `STAGING_SUPABASE_PROJECT_REF` | Supabase staging project settings |
| `PROD_SUPABASE_PROJECT_REF` | Supabase prod project settings |
| `DEV_SUPABASE_URL` | Local/dev Supabase URL (for PR tests) |
| `DEV_SUPABASE_SERVICE_ROLE_KEY` | Dev service role key |
| `VERCEL_TOKEN` | vercel.com/account/tokens |

---

## Dev Setup (unchanged)
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

## Key Files Added This Session
| File | Role |
|---|---|
| `infra/README.md` | Complete infra setup + deployment guide |
| `infra/environments/staging.tfvars` | Fill in before first deploy |
| `infra/modules/*/` | 6 Terraform modules (ECR, ECS, ElastiCache, Secrets, CloudWatch, CloudFront) |
| `.github/workflows/pr-checks.yml` | TS + tests + Vercel preview on every PR |
| `.github/workflows/staging-deploy.yml` | Auto-deploy to staging on master push |
| `.github/workflows/prod-deploy.yml` | Prod deploy with manual approval gate |
| `apps/web/next.config.mjs` | Security headers added |
| `apps/web/src/middleware.ts` | Auth + rate limiting |
| `supabase/audit/rls-audit.sql` | Run before prod launch |
| `tests/load/*.js` | k6 load tests |
