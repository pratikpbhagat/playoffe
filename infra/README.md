# PLAYOFFE Infrastructure

Terraform-managed AWS infrastructure for PLAYOFFE. Three environments — dev, staging, prod — each deployed independently from the same configuration.

## Environment Overview

| | Dev | Staging | Production |
|---|---|---|---|
| **URL** | dev.playoffe.com | staging.playoffe.com | playoffe.com |
| **Deploy trigger** | push to `develop` branch | push to `master` branch | push `v*.*.*` tag + approval |
| **Supabase project** | `playoffe-dev` | `playoffe-staging` | `playoffe-prod` |
| **Workers** | ECS 1 task (0.25 vCPU) | ECS 1 task (0.5 vCPU) | ECS 2 tasks (1 vCPU) |
| **Redis** | `cache.t3.micro` | `cache.t3.micro` | `cache.t3.small` |
| **Secrets path** | `/playoffe/dev/*` | `/playoffe/staging/*` | `/playoffe/prod/*` |
| **Image tag prefix** | `dev-<sha>` | `staging-<sha>` | `prod-<version>` |
| **Approval gate** | None | None | Required |

## What This Creates (per environment)

| Resource | Notes |
|---|---|
| ECR repository | `playoffe/workers` — shared, images tagged per env |
| ECS Fargate cluster | `playoffe-{env}-workers` |
| ECS service | Auto-scaling based on Redis queue depth |
| ElastiCache Redis | Sized per environment |
| Secrets Manager | All 14 env vars at `/playoffe/{env}/*` |
| CloudWatch alarms | Queue depth, task health, CPU, memory, post errors |
| CloudFront CDN | In front of `social-graphics` Supabase Storage bucket |

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

## Deploying Dev

```bash
cd infra
export TF_VAR_supabase_url="https://DEVPROJECT.supabase.co"
# ... set all other TF_VAR_* to dev project values ...

terraform plan -var-file="environments/dev.tfvars"
terraform apply -var-file="environments/dev.tfvars"
```

Also add `DEV_SUPABASE_PROJECT_REF` to GitHub Actions secrets after creating your Supabase dev project.

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

## Email (SES) Setup

PLAYOFFE sends email from **two separate paths** that are easy to confuse:

| Path | Used for | Configured via |
|---|---|---|
| App's own `sendEmail()` ([service.ts](../apps/web/src/lib/email/service.ts)) | Custom templates — verification email, manager-invite emails, etc. | AWS SES API, IAM access key, env vars in Vercel |
| Supabase Auth's built-in mailer | `resetPasswordForEmail()`, `signUp()` confirmation emails sent via `admin.auth.admin.generateLink` | Supabase dashboard SMTP settings (per-project), **not** related to the app's SES IAM user at all |

Changing one does **not** affect the other. If "the app's emails work but password-reset emails don't" (or vice versa), you're looking at the wrong path.

### 1. SES domain identity + DKIM (Terraform)

The [`modules/ses`](modules/ses) module creates, per environment:
- `aws_ses_domain_identity` + `aws_ses_domain_dkim` for `var.ses_domain` (default `playoffe.com`)
- A scoped IAM user `${name_prefix}-ses-sender` with an inline policy allowing only `ses:SendEmail`/`ses:SendRawEmail` against that one identity ARN
- An IAM access key for that user (outputs: `ses_access_key_id`, `ses_secret_access_key` — sensitive)

After `terraform apply`, add the 3 DKIM CNAME records to DNS:
```bash
terraform output ses_dkim_tokens
# Add as: <token>._domainkey.<domain> -> <token>.dkim.amazonses.com
```

SES starts in **sandbox mode** — it can only send to verified recipient addresses until AWS approves a production-access request (Console → SES → Account dashboard → "Request production access").

### 2. Wiring the IAM key into the app (`sendEmail()` path)

The IAM access key from step 1 is **not** an SMTP credential — `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` go straight into the app's env vars, since `service.ts` calls the SES API directly (not SMTP):

```
AWS_ACCESS_KEY_ID=<from terraform output ses_access_key_id>
AWS_SECRET_ACCESS_KEY=<from terraform output ses_secret_access_key>
AWS_REGION=ap-southeast-1
SES_FROM_EMAIL=noreply@playoffe.com
```

CI handles syncing these into Vercel automatically — both `staging-deploy.yml` and `prod-deploy.yml` have a "Sync SES env vars to Vercel" step that reads `STAGING_SES_*`/`PROD_SES_*` GitHub secrets and pushes them via `vercel env add` right before each deploy. Set these secrets once per environment (same place as the other `STAGING_*`/`PROD_*` secrets above):

| Secret | Value |
|---|---|
| `STAGING_SES_AWS_ACCESS_KEY_ID` / `PROD_SES_AWS_ACCESS_KEY_ID` | `terraform output ses_access_key_id` |
| `STAGING_SES_AWS_SECRET_ACCESS_KEY` / `PROD_SES_AWS_SECRET_ACCESS_KEY` | `terraform output ses_secret_access_key` |
| `STAGING_SES_FROM_EMAIL` / `PROD_SES_FROM_EMAIL` | e.g. `noreply@playoffe.com` |

### 3. Wiring Supabase Auth's mailer (password reset / signup confirmation path)

This is configured **per Supabase project**, in the dashboard — Terraform/CI do not touch it:

1. Generate **dedicated SES SMTP credentials** (Console → SES → SMTP settings → "Create SMTP credentials"). This is a different credential type from the IAM access key above — don't reuse the API key/secret here, it will fail with `535 Authentication Credentials Invalid`.
2. Supabase dashboard → **Project Settings → Authentication → SMTP Settings**:
   - Host: `email-smtp.<region>.amazonaws.com`
   - Port: `587`
   - Username / Password: the SMTP credentials from step 1 (region must match the SES identity's region — we use `ap-southeast-1`)
   - Sender email: must be the verified SES identity/domain
3. Save, then test by triggering `forgotPasswordAction` from the app's `/forgot-password` page (not the dashboard's own "Send recovery email" button — see gotcha below).

### 4. Gotcha: Supabase silently falls back to the bare Site URL

Supabase's `redirectTo`/`emailRedirectTo` is validated against an **allow-list** (Authentication → URL Configuration → Redirect URLs). If the URL you pass doesn't match an allow-listed pattern, GoTrue does **not** error — it silently substitutes the bare **Site URL**, which sends users to the home page instead of `/reset-password` or `/login?verified=1`.

We hit this twice (local `config.toml` and the hosted staging project). Make sure, per environment:
- **Site URL** = the app's bare origin (e.g. `https://staging.playoffe.com`)
- **Redirect URLs** allow-list includes a wildcard covering all app routes, e.g. `https://staging.playoffe.com/**`

If a recovery link's `redirect_to` query param comes back as just the bare domain (no path), that's the symptom — either the allow-list is missing the wildcard, or the email was triggered via the **dashboard's own "Send recovery email" button** (which always uses the bare Site URL and ignores our app's custom `redirectTo` entirely — trigger resets through the app's own form instead).

## Day-to-Day Operations

**Normal releases** — you never touch Terraform. Just:
```bash
git tag v1.0.0
git push origin v1.0.0
# Approve the deployment in GitHub → Actions
```

**Scaling up ECS** — edit `ecs_desired_count` in tfvars and `terraform apply`

**Updating a secret** — update the `TF_VAR_*` env var and `terraform apply`; Secrets Manager is updated and ECS tasks will pick up the new value on next deploy.
