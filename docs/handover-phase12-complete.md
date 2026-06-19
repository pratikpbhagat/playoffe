# Handover — Phase 12 Complete / AI Phase Begins

## Project Overview

**PLAYOFFE** — Full-stack pickleball tournament management platform.

**Stack:**
- Frontend: Next.js 14, Supabase Auth, hosted on Vercel
- Backend workers: Node.js + BullMQ, ECS Fargate Spot, ECR
- Database: Supabase (PostgreSQL)
- Monorepo: pnpm 10.12.1 workspaces + Turbo
- Repo: `github.com/playoffe/pf-core`

---

## What Was Completed This Phase

### Infrastructure (AWS + Supabase + Vercel)

- **Terraform** applied via HCP Terraform (org: `playoffe`, workspace: `playoffe-staging`)
  - ECS Fargate Spot cluster: `playoffe-staging-workers`
  - ECR repo: `playoffe/workers`
  - SSM Parameter Store: `/playoffe/staging/*` (13 secrets)
  - CloudWatch log group + alarms + dashboard
  - VPC: `vpc-0d5f2431218a69a91`, subnets: `subnet-05638cabfc3dbfa27`, `subnet-0665e522aaa6b9ffb`
  - Region: `ap-southeast-1` (Singapore)

- **Supabase projects:**
  - `playoffe-staging` — project ref `iaholpielqlrvktotjpu` → `staging.playoffe.com`
  - `playoffe-dev` — separate project for dev branch → `dev.playoffe.com` (in progress)

- **Vercel:** Project `pf-core` under `playoffe` org, `.vercel/project.json` committed to repo
  - `staging.playoffe.com` live and working
  - `vercel.json` at repo root handles monorepo build

### CI/CD Pipelines (GitHub Actions)

| Workflow | Trigger | Does |
|---|---|---|
| `dev-deploy.yml` | push to `dev` | Migrations → Vercel preview (dev Supabase) |
| `staging-deploy.yml` | push to `master` | Migrations → ECS deploy → Vercel production |
| `prod-deploy.yml` | git tag `v*` | Migrations → promote ECR image → ECS prod → Vercel |
| `pr-checks.yml` | PR opened/updated | Type-check, lint, build check |

### Key Config Files

| File | Purpose |
|---|---|
| `vercel.json` | Monorepo build config — pnpm install from root, filter build, `apps/web/.next` output |
| `.vercel/project.json` | Project/org IDs — committed so CI doesn't need extra secrets |
| `.npmrc` | `public-hoist-pattern[]=next` for Vercel framework detection |
| `workers/Dockerfile` | Multi-stage build — node:20-slim, pnpm@10.12.1 pinned via corepack |
| `infra/environments/staging.tfvars` | VPC/subnet IDs, Supabase storage URL |

### GitHub Secrets (current)

| Secret | Used by |
|---|---|
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | ECS deploy |
| `SUPABASE_ACCESS_TOKEN` | Supabase CLI (migrations) |
| `STAGING_SUPABASE_PROJECT_REF` | staging-deploy migrations |
| `STAGING_SUPABASE_SERVICE_ROLE_KEY` | staging admin operations |
| `DEV_SUPABASE_PROJECT_REF` | dev-deploy migrations |
| `DEV_SUPABASE_URL` / `DEV_SUPABASE_ANON_KEY` / `DEV_SUPABASE_SERVICE_ROLE_KEY` | dev Supabase + pr-checks |
| `VERCEL_TOKEN` | All Vercel deploys |

### Superadmin Setup

- Superadmin is identified via `auth.users.app_metadata.role === 'super_admin'`
- Must be created manually via **Supabase dashboard → Authentication → Users → Add user**
- After creating: run SQL to set role and create players row (see session history)
- Email: `admin@playoffe.com`
- Automated seeding via migration was attempted but abandoned — Supabase's admin API (`auth.admin.createUser`) is the correct approach; a script exists at `scripts/seed-superadmin.mjs` (currently reverted from CI, can be re-enabled)

### Branch Strategy

```
dev     →  dev.playoffe.com     (playoffe-dev Supabase, frontend only)
master  →  staging.playoffe.com (playoffe-staging Supabase, full stack)
v*      →  playoffe.com         (prod, future)
```

---

## Known Issues / Pending

1. **Superadmin seed in CI** — `scripts/seed-superadmin.mjs` exists but was reverted from the migrate job. Needs `STAGING_SUPABASE_SERVICE_ROLE_KEY` + `STAGING_SUPERADMIN_PASSWORD` GitHub secrets to re-enable.

2. **dev.playoffe.com domain** — DNS record and Vercel domain config for `dev.playoffe.com` not yet set up. Currently deploys to auto-generated Vercel preview URL.

3. **Terraform CI** — Terraform apply still runs manually from local machine. Automating via CI was discussed but not built yet.

4. **Prod environment** — `prod-deploy.yml` exists but no prod AWS infra provisioned yet. Planned for launch.

---

## Next Phase — AI Capabilities

Starting fresh session. User will provide AI feature specifications.

Key context for AI work:
- Anthropic API key is stored in SSM at `/playoffe/staging/ANTHROPIC_API_KEY`
- `@anthropic-ai/sdk` is already a dependency in `apps/web`
- Workers package (`packages/workers`) handles background jobs via BullMQ — good place for async AI jobs
- Supabase MCP server is configured: `iaholpielqlrvktotjpu`
