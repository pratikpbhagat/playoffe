# ── Secrets module: SSM Parameter Store (staging) or Secrets Manager (prod) ───
#
# staging (use_ssm=true):  SSM Standard tier — free, no limits for our use case
# prod    (use_ssm=false): Secrets Manager  — audit trail, rotation, 7-day recovery
#
# REDIS_URL is excluded here — it's a plain env var when using the Redis sidecar
# (localhost), and written back by main.tf when using ElastiCache (prod).

data "aws_region" "current"  {}
data "aws_caller_identity" "current" {}

locals {
  prefix = "/playoffe/${var.environment}"

  # The 13 application secrets (REDIS_URL handled separately in main.tf for prod)
  secrets = {
    NEXT_PUBLIC_SUPABASE_URL       = var.supabase_url
    NEXT_PUBLIC_SUPABASE_ANON_KEY  = var.supabase_anon_key
    SUPABASE_SERVICE_ROLE_KEY      = var.supabase_service_role_key
    SUPABASE_DB_PASSWORD           = var.supabase_db_password
    ANTHROPIC_API_KEY              = var.anthropic_api_key
    INSTAGRAM_APP_ID               = var.instagram_app_id
    INSTAGRAM_APP_SECRET           = var.instagram_app_secret
    FACEBOOK_APP_ID                = var.facebook_app_id
    FACEBOOK_APP_SECRET            = var.facebook_app_secret
    X_API_KEY                      = var.x_api_key
    X_API_SECRET                   = var.x_api_secret
    X_ACCESS_TOKEN                 = var.x_access_token
    X_ACCESS_TOKEN_SECRET          = var.x_access_token_secret
  }

  # Prod also needs REDIS_URL stored (populated after ElastiCache is ready)
  prod_extra_secrets = var.use_ssm ? {} : { REDIS_URL = "placeholder" }
  all_prod_secrets   = merge(local.secrets, local.prod_extra_secrets)
}

# ── SSM Parameter Store (staging / dev) ───────────────────────────────────────

resource "aws_ssm_parameter" "secrets" {
  for_each = var.use_ssm ? local.secrets : {}

  name        = "${local.prefix}/${each.key}"
  description = "PLAYOFFE ${var.environment}: ${each.key}"
  type        = "SecureString"
  value       = each.value

  tags = {
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# ── Secrets Manager (prod) ────────────────────────────────────────────────────

resource "aws_secretsmanager_secret" "secrets" {
  for_each = var.use_ssm ? {} : local.all_prod_secrets

  name                    = "${local.prefix}/${each.key}"
  description             = "PLAYOFFE ${var.environment}: ${each.key}"
  recovery_window_in_days = 7  # prod only — 7-day safety net before deletion
}

resource "aws_secretsmanager_secret_version" "secrets" {
  for_each = var.use_ssm ? {} : local.all_prod_secrets

  secret_id     = aws_secretsmanager_secret.secrets[each.key].id
  secret_string = each.value
}
