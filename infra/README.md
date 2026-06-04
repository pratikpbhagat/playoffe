# PLAYOFFE Infrastructure

Terraform-managed AWS infrastructure for PLAYOFFE. Each environment (staging, prod) is an independent deployment run from the same configuration.

## What This Creates

| Resource | Staging | Production |
|---|---|---|
| ECR repository | `playoffe/workers` (shared) | same repo, different tags |
| ECS Fargate cluster | `playoffe-staging-workers` | `playoffe-prod-workers` |
| ECS service | 1 task, auto-scale 1–3 | 2 tasks, auto-scale 2–6 |
| ElastiCache Redis | `cache.t3.micro` | `cache.t3.small` |
| Secrets Manager | `/playoffe/staging/*` | `/playoffe/prod/*` |
| CloudWatch alarms | queue depth, task health, post errors | same |
| CloudFront CDN | `social-graphics` bucket | same |

## Prerequisites

1. **Terraform ≥ 1.7** — [install](https://developer.hashicorp.com/terraform/install)
2. **AWS CLI** configured with an IAM user that has admin permissions
3. **Supabase CLI** — `npm install -g supabase`
4. Your Supabase staging + prod project refs (from dashboard.supabase.com)

## First-Time Setup (one-time, per AWS account)

```bash
cd infra

# 1. Initialise Terraform (downloads providers)
terraform init

# 2. Create a Terraform Cloud workspace (free) OR use S3 backend
#    For Terraform Cloud: uncomment the 'cloud {}' block in terraform.tf
#    then run: terraform login

# 3. Fill in your VPC/subnet IDs in environments/staging.tfvars
#    Find them: AWS Console → VPC → Your VPCs
```

## Deploying Staging

```bash
cd infra

# Set sensitive values as environment variables (never commit these)
export TF_VAR_supabase_url="https://XXXXXXXX.supabase.co"
export TF_VAR_supabase_anon_key="eyJ..."
export TF_VAR_supabase_service_role_key="eyJ..."
export TF_VAR_supabase_db_password="your-db-password"
export TF_VAR_anthropic_api_key="sk-ant-..."
export TF_VAR_instagram_app_id="..."
export TF_VAR_instagram_app_secret="..."
export TF_VAR_facebook_app_id="..."
export TF_VAR_facebook_app_secret="..."
export TF_VAR_x_api_key="..."
export TF_VAR_x_api_secret="..."
export TF_VAR_x_access_token="..."
export TF_VAR_x_access_token_secret="..."

# Preview what will be created
terraform plan -var-file="environments/staging.tfvars"

# Apply (creates all resources — takes ~10 minutes first time)
terraform apply -var-file="environments/staging.tfvars"

# Note the outputs — you'll need these for GitHub Actions secrets:
terraform output
```

## Deploying Production

Same as staging, but with prod env vars and prod tfvars:

```bash
export TF_VAR_supabase_url="https://YYYYYYYY.supabase.co"  # prod Supabase project
# ... set all other TF_VAR_* to prod values ...

terraform apply -var-file="environments/prod.tfvars"
```

## GitHub Actions Secrets to Set

After running `terraform apply`, go to your GitHub repo → Settings → Secrets → Actions and add:

| Secret | Value | Where to find it |
|---|---|---|
| `AWS_ACCESS_KEY_ID` | IAM user key | AWS Console → IAM |
| `AWS_SECRET_ACCESS_KEY` | IAM user secret | AWS Console → IAM |
| `SUPABASE_ACCESS_TOKEN` | Personal access token | supabase.com/dashboard/account/tokens |
| `STAGING_SUPABASE_PROJECT_REF` | e.g. `abcdefghijklmnop` | Supabase staging project settings |
| `PROD_SUPABASE_PROJECT_REF` | e.g. `qrstuvwxyzabcdef` | Supabase prod project settings |
| `DEV_SUPABASE_URL` | Dev project URL | For PR check tests |
| `DEV_SUPABASE_SERVICE_ROLE_KEY` | Dev service role key | For PR check tests |
| `VERCEL_TOKEN` | Vercel personal token | vercel.com/account/tokens |

## Vercel Setup

```bash
# Install Vercel CLI
npm install -g vercel

# Link your project
cd apps/web
vercel link

# Add environment variables for staging (production environment in Vercel)
vercel env add NEXT_PUBLIC_SUPABASE_URL production  # staging Supabase URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
vercel env add ANTHROPIC_API_KEY production

# Add a custom domain
vercel domains add staging.playoffe.com
```

## GitHub Environment Protection (Prod Approval Gate)

1. GitHub repo → Settings → Environments → New environment → name it `production`
2. Check **Required reviewers** → add yourself
3. The `prod-deploy.yml` workflow references `environment: production` — it will pause and wait for your approval before deploying

## Adding a New Environment

1. Copy `environments/staging.tfvars` → `environments/qa.tfvars`
2. Update `environment = "qa"` and fill in values
3. Run `terraform apply -var-file="environments/qa.tfvars"`
4. Done — full environment in ~10 minutes

## Destroying an Environment

```bash
# ⚠️ Destructive — removes all resources for that environment
terraform destroy -var-file="environments/staging.tfvars"
```

## Day-to-Day Operations

**Normal releases** — you never touch Terraform. Just:
```bash
git tag v1.0.0
git push origin v1.0.0
# Approve the deployment in GitHub → Actions
```

**Scaling up ECS** — edit `ecs_desired_count` in tfvars and `terraform apply`

**Updating a secret** — update the `TF_VAR_*` env var and `terraform apply`; Secrets Manager is updated and ECS tasks will pick up the new value on next deploy.
