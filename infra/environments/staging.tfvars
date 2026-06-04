# ── PLAYOFFE Staging Environment ──────────────────────────────────────────────
# Fill in the values below after creating your Supabase staging project.
# NEVER commit sensitive values — use TF_VAR_* environment variables or
# a secrets manager integration for the sensitive fields.

environment = "staging"
aws_region  = "ap-southeast-1"

# Networking — paste your default VPC ID and subnet IDs from:
# AWS Console → VPC → Your VPCs / Subnets
vpc_id     = "vpc-XXXXXXXXXXXXXXXXX"
subnet_ids = ["subnet-XXXXXXXXXXXXXXXXX", "subnet-XXXXXXXXXXXXXXXXX"]

# ECS Workers
ecs_desired_count = 1
ecs_cpu           = 512   # 0.5 vCPU
ecs_memory        = 1024  # 1 GB
workers_image_tag = "latest"

# ElastiCache Redis
redis_node_type = "cache.t3.micro"

# Alerts
alert_email = "alerts-staging@playoffe.com"

# Supabase Storage CDN origin — format: <project-ref>.supabase.co
supabase_storage_url = "https://XXXXXXXXXXXXXXXX.supabase.co/storage/v1/object/public/social-graphics"

# ── Sensitive vars — set via environment variables, NOT in this file ──────────
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
