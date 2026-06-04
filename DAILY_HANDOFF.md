# PLAYOFFE — Daily Handoff
**Date:** 4 June 2026
**Branch:** `master`
**Last Commit:** pending push — Terraform cost optimisations

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
| Hosting | Vercel Hobby (frontend) + AWS ECS Fargate (workers) |
| Package Manager | pnpm 10 (workspace monorepo) |

---

## Phase Status

| Phase | Status |
|---|---|
| Phases 1–11 | ✅ Complete |
| Phase 12 — Infrastructure code | ✅ Complete |
| Phase 12 — Real-world provisioning | ⏳ Not started |

---

## Infrastructure Strategy

**Staging only** until full testing is complete. Production added at launch.

### Cost by environment

| | Staging (now) | Production (at launch) |
|---|---|---|
| **Monthly cost** | **~$9/month** | **~$130/month** |
| ECS compute | Fargate Spot (~$6) | Fargate on-demand (~$83) |
| Redis | Sidecar in task ($0) | ElastiCache t3.small ($26) |
| Secrets | SSM Parameter Store ($0) | Secrets Manager ($6) |
| CloudWatch | Alarms + logs (~$2) | Alarms + logs (~$3) |
| ECR | Shared ($1) | Shared ($1) |
| Supabase | Free tier ($0) | Pro ($25) |
| Vercel | Hobby ($0) | Pro ($20) |

### How the cost flags work

All three optimisations are **derived automatically from `var.environment`** in `infra/main.tf`:

```hcl
locals {
  is_prod           = var.environment == "prod"
  use_spot          = !local.is_prod   # Fargate Spot for staging
  use_redis_sidecar = !local.is_prod   # Redis sidecar for staging
  use_ssm           = !local.is_prod   # SSM Parameter Store for staging
}
```

No manual flags to set. `staging.tfvars` → cheap. `prod.tfvars` → full production grade. Everything else is automatic.

After `terraform apply`, the `cost_mode` output confirms what's active:
```
cost_mode = "Fargate Spot, Redis sidecar, SSM (free)"   ← staging
cost_mode = "Fargate on-demand, ElastiCache, Secrets Manager"  ← prod
```

---

## Terraform Module Summary

```
infra/
  terraform.tf           — provider + state backend
  variables.tf           — all input variables
  main.tf                — environment locals + module composition
  outputs.tf             — ECR URL, ECS names, cost_mode summary
  environments/
    staging.tfvars        — ~$9/month, fill VPC/subnet IDs
    prod.tfvars           — ~$130/month, fill VPC/subnet IDs at launch
  modules/
    ecr/                  — shared image registry, lifecycle policies
    secrets/              — SSM (staging) or Secrets Manager (prod), 13 secrets
    elasticache/          — Redis cluster (prod only, count=0 on staging)
    ecs/                  — Fargate cluster + task def + service + auto-scaling
                            Redis sidecar container injected when use_redis_sidecar=true
                            Fargate Spot capacity provider when use_spot=true
                            IAM grants ssm:GetParameters or secretsmanager:GetSecretValue
    cloudwatch/           — ECS alarms always; ElastiCache alarm only when cluster exists
    cloudfront/           — CDN for social-graphics Supabase Storage bucket
  README.md               — full provisioning guide with all commands
```

---

## GitHub Actions Workflows

| Workflow | Trigger | Status |
|---|---|---|
| `pr-checks.yml` | PR opened | ✅ Active |
| `staging-deploy.yml` | Push to `master` | ✅ Active |
| `keep-alive.yml` | Every Monday 9am UTC | ✅ Active (prevents Supabase free-tier pausing) |
| `dev-deploy.yml` | Push to `develop` branch | ⏳ Deferred |
| `prod-deploy.yml` | Push `v*.*.*` tag | ⏳ Deferred until launch |

---

## What Needs to Happen Next — Staging Provisioning (~3 hours)

### Step 1 — AWS IAM (~15 min)
- Console → IAM → Users → Create `playoffe-deploy`, attach `AdministratorAccess`
- Create Access Key → "Application running outside AWS" → save ID + Secret (shown once)

### Step 2 — Supabase staging project (~15 min)
- supabase.com → New project → `playoffe-staging`, region: ap-southeast-1
- Save: **Project Ref**, **Anon key**, **Service role key**, **DB password**
- Create Personal Access Token: supabase.com/dashboard/account/tokens

### Step 3 — Vercel (~15 min)
- `cd apps/web && vercel login && vercel link`
- Create token: vercel.com/account/tokens → `playoffe-github-actions`
- Add domain in Vercel: `staging.playoffe.com` → add DNS record at registrar

### Step 4 — Fill Terraform config (~10 min)
In `infra/environments/staging.tfvars`, fill in:
```hcl
vpc_id               = "vpc-XXXXXXXXXXXXXXXXX"   # AWS Console → VPC
subnet_ids           = ["subnet-XXX", "subnet-YYY"]  # 2 subnets, different AZs
supabase_storage_url = "https://<staging-ref>.supabase.co/storage/v1/object/public/social-graphics"
```

### Step 5 — Terraform deploy (~15 min + 10 min wait)
```bash
cd infra
terraform init

# Export all 13 secrets as env vars
export TF_VAR_supabase_url="https://<staging-ref>.supabase.co"
export TF_VAR_supabase_anon_key="eyJ..."
export TF_VAR_supabase_service_role_key="eyJ..."
export TF_VAR_supabase_db_password="..."
export TF_VAR_anthropic_api_key="sk-ant-..."
export TF_VAR_instagram_app_id="..."
export TF_VAR_instagram_app_secret="..."
export TF_VAR_facebook_app_id="..."
export TF_VAR_facebook_app_secret="..."
export TF_VAR_x_api_key="..."
export TF_VAR_x_api_secret="..."
export TF_VAR_x_access_token="..."
export TF_VAR_x_access_token_secret="..."

terraform plan  -var-file="environments/staging.tfvars"   # preview
terraform apply -var-file="environments/staging.tfvars"   # ~10 min
terraform output                                           # note ECR URL + ECS names
```

Verify `cost_mode = "Fargate Spot, Redis sidecar, SSM (free)"` in output.

### Step 6 — Supabase migrations + storage (~10 min)
```bash
supabase db push --project-ref <staging-ref>
# Then in Supabase Dashboard → Storage → New bucket:
# Name: social-graphics | Public: yes | Max upload size: 10MB
```

### Step 7 — GitHub secrets (~15 min)
GitHub → repo → Settings → Secrets → Actions → add:

| Secret | Value |
|---|---|
| `AWS_ACCESS_KEY_ID` | From Step 1 |
| `AWS_SECRET_ACCESS_KEY` | From Step 1 |
| `SUPABASE_ACCESS_TOKEN` | From Step 2 |
| `STAGING_SUPABASE_PROJECT_REF` | From Step 2 |
| `DEV_SUPABASE_URL` | `https://<staging-ref>.supabase.co` |
| `DEV_SUPABASE_ANON_KEY` | Staging anon key |
| `DEV_SUPABASE_SERVICE_ROLE_KEY` | Staging service role key |
| `VERCEL_TOKEN` | From Step 3 |

### Step 8 — Validate (~30 min)
```bash
# Trigger staging deploy
git commit --allow-empty -m "chore: trigger staging pipeline validation"
git push origin master

# Verify
curl -I https://staging.playoffe.com       # 200 + security headers
# AWS ECS Console → playoffe-staging-workers → 1 task running (Fargate Spot)
# AWS Systems Manager → Parameter Store → /playoffe/staging/* → 13 parameters
```

---

## Adding Production (at launch)

When all three are true:
- [ ] Manual testing complete on staging
- [ ] k6 load tests all pass (`tests/load/`)
- [ ] RLS audit clean (`supabase/audit/rls-audit.sql`)

```bash
# One-time infra
terraform apply -var-file="environments/prod.tfvars"   # ~10 min, ~$130/month
supabase db push --project-ref <prod-ref>
# Create social-graphics bucket on prod Supabase project

# Add to GitHub Secrets: PROD_SUPABASE_PROJECT_REF
# Create GitHub 'production' environment with required reviewer (yourself)

# Every release after that
git tag v1.0.0 && git push origin v1.0.0
# → GitHub Actions → Approve → live
```

---

## Local Dev Setup
```bash
supabase start
docker start pickleball-redis
cd apps/web && (unset ANTHROPIC_API_KEY && npm run dev)
cd workers && pnpm dev
```

**Test accounts:**
- `alex@playoffe.dev` / `TestPass123!` — Super Admin
- `sam@playoffe.dev` / `TestPass123!` — Club Owner (Blue Bird Club)

**Gotchas:**
- `ANTHROPIC_API_KEY` — always unset before `npm run dev`
- `pnpm approve-builds` required after fresh install
- Strip first + last 2 lines from `supabase gen types` output (CLI noise)

---

## 🚀 Resume Prompt

> Copy everything from here to the end and paste into a new Claude Code session.

---

We are building **PLAYOFFE** — a full-stack pickleball tournament management platform.

**Repo:** `C:\Projects\Repositories\pratik\pickleball-platform`
**GitHub:** https://github.com/pratikpbhagat/playoffe
**Branch:** `master`

---

### Recent commits
```
(latest) chore: Terraform cost optimisations — Fargate Spot + Redis sidecar + SSM
f3d0497 chore: keep-alive workflow + updated handoff (staging-only, free Supabase)
d5cb787 feat: add dev environment — Terraform config + CI/CD workflow
17b5142 feat: Phase 12 — infrastructure, CI/CD, security, load tests
659c57d feat: merge feature/smart-scheduling — Phase 11 complete + pre-Phase 12 fixes
```

---

### Phase status
- **Phases 1–11:** ✅ Complete
- **Phase 12 — Infrastructure code:** ✅ Complete
- **Phase 12 — Real-world provisioning:** ⏳ Not started

---

### Agreed infrastructure decisions

**Staging only** for now (~$9/month). Prod added at launch (~$130/month).

| | Staging | Production |
|---|---|---|
| Cost | ~$9/month | ~$130/month |
| ECS | Fargate Spot | Fargate on-demand |
| Redis | Sidecar in task | ElastiCache t3.small |
| Secrets | SSM free tier | Secrets Manager |
| Supabase | Free tier | Pro ($25) |
| Vercel | Hobby | Pro ($20) |

All three cost flags (`use_spot`, `use_redis_sidecar`, `use_ssm`) are **derived automatically from `environment`** in `infra/main.tf` — no manual config needed.

---

### Terraform modules built

`infra/` contains 6 modules: ECR, ECS (Spot + sidecar support), ElastiCache (prod only, `count=0` on staging), Secrets (SSM or Secrets Manager), CloudWatch (conditional ElastiCache alarm), CloudFront. `staging.tfvars` and `prod.tfvars` ready — just need VPC/subnet IDs filled in.

---

### GitHub Actions workflows

- `pr-checks.yml` — TS + tests + Vercel preview on every PR ✅
- `staging-deploy.yml` — push to master → full staging deploy ✅
- `keep-alive.yml` — Monday ping to prevent Supabase free-tier pausing ✅
- `dev-deploy.yml` — deferred (develop branch) ⏳
- `prod-deploy.yml` — deferred (v*.*.* tags + approval gate) ⏳

---

### What needs to happen next — 8-step staging provisioning

1. **AWS IAM** — create `playoffe-deploy` user, AdministratorAccess, Access Key
2. **Supabase** — create `playoffe-staging` project (ap-southeast-1), save ref + keys; create Personal Access Token
3. **Vercel** — `vercel login && vercel link` in apps/web; create API token; add staging.playoffe.com domain
4. **`staging.tfvars`** — fill `vpc_id`, `subnet_ids`, `supabase_storage_url`
5. **Terraform** — `cd infra && terraform init && terraform apply -var-file="environments/staging.tfvars"` (set all 13 `TF_VAR_*` env vars first). Verify `cost_mode = "Fargate Spot, Redis sidecar, SSM (free)"`
6. **Supabase** — `supabase db push --project-ref <ref>`; create `social-graphics` bucket (public)
7. **GitHub secrets** — 8 secrets: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `SUPABASE_ACCESS_TOKEN`, `STAGING_SUPABASE_PROJECT_REF`, `DEV_SUPABASE_URL`, `DEV_SUPABASE_ANON_KEY`, `DEV_SUPABASE_SERVICE_ROLE_KEY`, `VERCEL_TOKEN`
8. **Validate** — empty commit to master → watch staging-deploy.yml → verify staging.playoffe.com live

Full commands in `DAILY_HANDOFF.md` and `infra/README.md`.

---

### Local dev
```bash
supabase start && docker start pickleball-redis
cd apps/web && (unset ANTHROPIC_API_KEY && npm run dev)
cd workers && pnpm dev
```
Accounts: `alex@playoffe.dev` / `TestPass123!` (Super Admin) · `sam@playoffe.dev` / `TestPass123!` (Club Owner)

Please read `DAILY_HANDOFF.md`, confirm understanding, then ask which provisioning step to begin with.
