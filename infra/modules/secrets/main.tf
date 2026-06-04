# ── Secrets Manager: all environment secrets ──────────────────────────────────
# Path convention: /playoffe/{env}/{SECRET_NAME}
# ECS task definition references these ARNs; values never touch CI logs.

locals {
  prefix = "/playoffe/${var.environment}"

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
    # REDIS_URL is written by main.tf after ElastiCache is created
    REDIS_URL                      = "placeholder"
  }
}

resource "aws_secretsmanager_secret" "secrets" {
  for_each = local.secrets

  name                    = "${local.prefix}/${each.key}"
  description             = "PLAYOFFE ${var.environment}: ${each.key}"
  recovery_window_in_days = var.environment == "prod" ? 7 : 0
}

resource "aws_secretsmanager_secret_version" "secrets" {
  for_each = local.secrets

  secret_id     = aws_secretsmanager_secret.secrets[each.key].id
  secret_string = each.value
}
