# ── PLAYOFFE — Infrastructure root ────────────────────────────────────────────
#
# Deploy per environment:
#   terraform apply -var-file="environments/staging.tfvars"
#   terraform apply -var-file="environments/prod.tfvars"
#
# Cost strategy — automatically applied by environment:
#
#   staging:  Fargate Spot + Redis sidecar + SSM Parameter Store  → ~$9/month
#   prod:     Fargate on-demand + ElastiCache + Secrets Manager   → ~$130/month

locals {
  name_prefix = "playoffe-${var.environment}"
  is_prod     = var.environment == "prod"

  # These three flags drive all cost optimisations
  use_spot          = !local.is_prod  # Fargate Spot for non-prod (~70% cheaper)
  use_redis_sidecar = !local.is_prod  # Redis runs in the task — no ElastiCache cost
  use_ssm           = !local.is_prod  # SSM Parameter Store is free; Secrets Manager is not
}

# ── ECR: container image registry (shared across environments) ────────────────
module "ecr" {
  source      = "./modules/ecr"
  name_prefix = "playoffe"
}

# ── Secrets / SSM: env vars per environment ───────────────────────────────────
# staging → SSM Parameter Store (free)
# prod    → Secrets Manager ($0.40/secret/month, rotation, audit trail)
module "secrets" {
  source      = "./modules/secrets"
  name_prefix = local.name_prefix
  environment = var.environment
  use_ssm     = local.use_ssm

  supabase_url              = var.supabase_url
  supabase_anon_key         = var.supabase_anon_key
  supabase_service_role_key = var.supabase_service_role_key
  supabase_db_password      = var.supabase_db_password
  anthropic_api_key         = var.anthropic_api_key
  instagram_app_id          = var.instagram_app_id
  instagram_app_secret      = var.instagram_app_secret
  facebook_app_id           = var.facebook_app_id
  facebook_app_secret       = var.facebook_app_secret
  x_api_key                 = var.x_api_key
  x_api_secret              = var.x_api_secret
  x_access_token            = var.x_access_token
  x_access_token_secret     = var.x_access_token_secret
}

# ── ElastiCache: managed Redis (prod only) ────────────────────────────────────
# staging uses Redis sidecar inside the ECS task — no separate cluster needed
module "elasticache" {
  count = local.is_prod ? 1 : 0

  source      = "./modules/elasticache"
  name_prefix = local.name_prefix
  vpc_id      = var.vpc_id
  subnet_ids  = var.subnet_ids
  node_type   = var.redis_node_type
}

# ── ECS Fargate: workers ──────────────────────────────────────────────────────
module "ecs" {
  source      = "./modules/ecs"
  name_prefix = local.name_prefix
  environment = var.environment
  aws_region  = var.aws_region

  ecr_repository_url = module.ecr.repository_url
  image_tag          = var.workers_image_tag
  desired_count      = var.ecs_desired_count
  cpu                = var.ecs_cpu
  memory             = var.ecs_memory

  vpc_id     = var.vpc_id
  subnet_ids = var.subnet_ids

  # Cost flags — drives Spot, sidecar, and IAM policy type
  use_spot          = local.use_spot
  use_redis_sidecar = local.use_redis_sidecar
  use_ssm           = local.use_ssm

  # prod: real ElastiCache URL. staging: ignored (sidecar uses localhost)
  redis_url         = local.is_prod ? "redis://${module.elasticache[0].primary_endpoint}:6379" : "redis://localhost:6379"
  elasticache_sg_id = local.is_prod ? module.elasticache[0].security_group_id : null

  secret_arns = module.secrets.secret_arns
}

# ── CloudWatch: alarms + dashboard ────────────────────────────────────────────
module "cloudwatch" {
  source      = "./modules/cloudwatch"
  name_prefix = local.name_prefix
  environment = var.environment

  ecs_cluster_name = module.ecs.cluster_name
  ecs_service_name = module.ecs.service_name
  redis_cluster_id = local.is_prod ? module.elasticache[0].cluster_id : null
  alert_email      = var.alert_email
}

# ── CloudFront: CDN for social-graphics storage bucket ────────────────────────
module "cloudfront" {
  source               = "./modules/cloudfront"
  name_prefix          = local.name_prefix
  supabase_storage_url = var.supabase_storage_url
}

# ── Write Redis URL into Secrets Manager (prod only) ─────────────────────────
resource "aws_secretsmanager_secret_version" "redis_url" {
  count = local.is_prod ? 1 : 0

  secret_id     = module.secrets.redis_url_secret_id
  secret_string = "redis://${module.elasticache[0].primary_endpoint}:6379"

  depends_on = [module.elasticache, module.secrets]
}
