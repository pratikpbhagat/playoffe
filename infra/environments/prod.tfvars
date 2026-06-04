# ── PLAYOFFE Production Environment ───────────────────────────────────────────
# Fill in after staging is validated and you are ready for first launch.

environment = "prod"
aws_region  = "ap-southeast-1"

vpc_id     = "vpc-XXXXXXXXXXXXXXXXX"
subnet_ids = ["subnet-XXXXXXXXXXXXXXXXX", "subnet-XXXXXXXXXXXXXXXXX"]

# ECS Workers — higher capacity for prod
ecs_desired_count = 2
ecs_cpu           = 1024  # 1 vCPU
ecs_memory        = 2048  # 2 GB
workers_image_tag = "latest"

# ElastiCache Redis — larger node for prod
redis_node_type = "cache.t3.small"

# Alerts
alert_email = "alerts@playoffe.com"

supabase_storage_url = "https://XXXXXXXXXXXXXXXX.supabase.co/storage/v1/object/public/social-graphics"

# ── Sensitive vars — set via TF_VAR_* environment variables ──────────────────
# Same variables as staging.tfvars but pointing to prod Supabase project
