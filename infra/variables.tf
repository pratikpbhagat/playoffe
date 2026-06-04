# ── Core ──────────────────────────────────────────────────────────────────────

variable "environment" {
  description = "Deployment environment: staging | prod"
  type        = string
  validation {
    condition     = contains(["staging", "prod"], var.environment)
    error_message = "environment must be 'staging' or 'prod'."
  }
}

variable "aws_region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "ap-southeast-1"
}

# ── Networking ────────────────────────────────────────────────────────────────

variable "vpc_id" {
  description = "VPC ID for ECS tasks and ElastiCache. Use default VPC or your own."
  type        = string
}

variable "subnet_ids" {
  description = "List of subnet IDs for ECS tasks and ElastiCache subnet group"
  type        = list(string)
}

# ── ECS Workers ───────────────────────────────────────────────────────────────

variable "workers_image_tag" {
  description = "Docker image tag to deploy (e.g. 'staging-abc1234' or 'prod-abc1234')"
  type        = string
  default     = "latest"
}

variable "ecs_desired_count" {
  description = "Number of worker tasks to run"
  type        = number
  default     = 1
}

variable "ecs_cpu" {
  description = "ECS task CPU units (256 = 0.25 vCPU)"
  type        = number
  default     = 512
}

variable "ecs_memory" {
  description = "ECS task memory in MiB"
  type        = number
  default     = 1024
}

# ── ElastiCache Redis ─────────────────────────────────────────────────────────

variable "redis_node_type" {
  description = "ElastiCache node type"
  type        = string
  default     = "cache.t3.micro"
}

# ── Secrets (provide via tfvars — never commit these) ─────────────────────────

variable "supabase_url" {
  description = "Supabase project URL (NEXT_PUBLIC_SUPABASE_URL)"
  type        = string
  sensitive   = true
}

variable "supabase_anon_key" {
  description = "Supabase anon/public key"
  type        = string
  sensitive   = true
}

variable "supabase_service_role_key" {
  description = "Supabase service role key (server-only)"
  type        = string
  sensitive   = true
}

variable "supabase_db_password" {
  description = "Supabase database password"
  type        = string
  sensitive   = true
}

variable "anthropic_api_key" {
  description = "Anthropic API key for AI scheduling assistant"
  type        = string
  sensitive   = true
}

variable "instagram_app_id" {
  type      = string
  sensitive = true
}

variable "instagram_app_secret" {
  type      = string
  sensitive = true
}

variable "facebook_app_id" {
  type      = string
  sensitive = true
}

variable "facebook_app_secret" {
  type      = string
  sensitive = true
}

variable "x_api_key" {
  type      = string
  sensitive = true
}

variable "x_api_secret" {
  type      = string
  sensitive = true
}

variable "x_access_token" {
  type      = string
  sensitive = true
}

variable "x_access_token_secret" {
  type      = string
  sensitive = true
}

# ── Alerts ────────────────────────────────────────────────────────────────────

variable "alert_email" {
  description = "Email address for CloudWatch alarm notifications"
  type        = string
}

# ── Domains ───────────────────────────────────────────────────────────────────

variable "supabase_storage_url" {
  description = "Base URL of the Supabase social-graphics storage bucket (for CloudFront origin)"
  type        = string
}
