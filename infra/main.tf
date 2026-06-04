# ── PLAYOFFE — Infrastructure root ────────────────────────────────────────────
#
# Composes all modules. Deploy per environment:
#   terraform apply -var-file="environments/staging.tfvars"
#   terraform apply -var-file="environments/prod.tfvars"

locals {
  name_prefix = "playoffe-${var.environment}"
}

# ── ECR: container image registry (shared across environments) ────────────────
module "ecr" {
  source      = "./modules/ecr"
  name_prefix = "playoffe" # one repo, images tagged per env
}

# ── Secrets Manager: all env vars per environment ─────────────────────────────
module "secrets" {
  source      = "./modules/secrets"
  name_prefix = local.name_prefix
  environment = var.environment

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

# ── ElastiCache: managed Redis ────────────────────────────────────────────────
module "elasticache" {
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

  redis_url          = "redis://${module.elasticache.primary_endpoint}:6379"
  secret_arns        = module.secrets.secret_arns
  elasticache_sg_id  = module.elasticache.security_group_id
}

# ── CloudWatch: alarms + dashboard ────────────────────────────────────────────
module "cloudwatch" {
  source      = "./modules/cloudwatch"
  name_prefix = local.name_prefix
  environment = var.environment

  ecs_cluster_name  = module.ecs.cluster_name
  ecs_service_name  = module.ecs.service_name
  redis_cluster_id  = module.elasticache.cluster_id
  alert_email       = var.alert_email
}

# ── CloudFront: CDN for social-graphics storage bucket ────────────────────────
module "cloudfront" {
  source               = "./modules/cloudfront"
  name_prefix          = local.name_prefix
  supabase_storage_url = var.supabase_storage_url
}

# ── Write Redis URL back into Secrets Manager ─────────────────────────────────
resource "aws_secretsmanager_secret_version" "redis_url" {
  secret_id     = module.secrets.redis_url_secret_id
  secret_string = "redis://${module.elasticache.primary_endpoint}:6379"

  depends_on = [module.elasticache, module.secrets]
}
