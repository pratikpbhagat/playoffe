# ── PLAYOFFE Production Environment ───────────────────────────────────────────
# Target cost: ~$130/month
# Deploy only after staging is fully validated (manual + load + security testing).
#
# Production infrastructure (applied automatically for environment = "prod"):
#   ✅ Fargate on-demand  — no interruptions, SLA-backed
#   ✅ ElastiCache Redis   — persistent, HA, daily snapshots (cache.t3.small)
#   ✅ Secrets Manager     — audit trail, rotation support, 7-day recovery window
#
# Fill in vpc_id, subnet_ids, and supabase_storage_url before running terraform apply.

environment = "prod"
aws_region  = "ap-southeast-1"

vpc_id     = "vpc-XXXXXXXXXXXXXXXXX"
subnet_ids = ["subnet-XXXXXXXXXXXXXXXXX", "subnet-XXXXXXXXXXXXXXXXX"]

# ECS Workers
ecs_desired_count = 2
ecs_cpu           = 1024  # 1 vCPU
ecs_memory        = 2048  # 2 GB
workers_image_tag = "latest"

# ElastiCache Redis (prod only — staging uses sidecar)
redis_node_type = "cache.t3.small"

# Alerts
alert_email = "alerts@playoffe.com"

# Supabase Storage CDN origin — use prod Supabase project ref
supabase_storage_url = "https://XXXXXXXXXXXXXXXX.supabase.co/storage/v1/object/public/social-graphics"

# ── Sensitive values — export as TF_VAR_* before running terraform apply ──────
# Point all values to the PROD Supabase project (different from staging)
# export TF_VAR_supabase_url="https://YYYYYYYY.supabase.co"
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
