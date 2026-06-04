# ── PLAYOFFE Staging Environment ──────────────────────────────────────────────
# Target cost: ~$9/month
#
# Cost optimisations applied automatically (environment = "staging"):
#   ✅ Fargate Spot       — ~70% cheaper compute, graceful shutdown handles interruptions
#   ✅ Redis sidecar      — Redis runs inside the ECS task, no ElastiCache cluster needed
#   ✅ SSM Parameter Store — free secret storage (vs $6/month Secrets Manager)
#
# Fill in vpc_id, subnet_ids, and supabase_storage_url before running terraform apply.
# Set all TF_VAR_* sensitive values as shell environment variables (never in this file).

environment = "staging"
aws_region  = "ap-southeast-1"

# Networking — AWS Console → VPC → Your VPCs / Subnets
vpc_id     = "vpc-XXXXXXXXXXXXXXXXX"
subnet_ids = ["subnet-XXXXXXXXXXXXXXXXX", "subnet-XXXXXXXXXXXXXXXXX"]

# ECS Workers
ecs_desired_count = 1
ecs_cpu           = 512   # 0.5 vCPU  (shared between worker + Redis sidecar)
ecs_memory        = 1024  # 1 GB      (worker ~700MB + Redis sidecar ~256MB)
workers_image_tag = "latest"

# redis_node_type not used for staging (Redis runs as sidecar, no ElastiCache)

# Alerts
alert_email = "alerts-staging@playoffe.com"

# Supabase Storage CDN origin
supabase_storage_url = "https://XXXXXXXXXXXXXXXX.supabase.co/storage/v1/object/public/social-graphics"

# ── Sensitive values — export as TF_VAR_* before running terraform apply ──────
# export TF_VAR_supabase_url="https://XXXXXXXX.supabase.co"
# export TF_VAR_supabase_anon_key="eyJ..."
# export TF_VAR_supabase_service_role_key="eyJ..."
# export TF_VAR_supabase_db_password="..."
# export TF_VAR_anthropic_api_key="sk-ant-..."
# export TF_VAR_instagram_app_id="..."
# export TF_VAR_instagram_app_secret="..."
# export TF_VAR_facebook_app_id="..."
# export TF_VAR_facebook_app_secret="..."
# export TF_VAR_x_api_key="..."
# export TF_VAR_x_api_secret="..."
# export TF_VAR_x_access_token="..."
# export TF_VAR_x_access_token_secret="..."
