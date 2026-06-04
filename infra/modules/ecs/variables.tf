variable "name_prefix"        { type = string }
variable "environment"        { type = string }
variable "aws_region"         { type = string }
variable "ecr_repository_url" { type = string }
variable "image_tag"          { type = string }
variable "desired_count"      { type = number; default = 1 }
variable "cpu"                { type = number; default = 512 }
variable "memory"             { type = number; default = 1024 }
variable "vpc_id"             { type = string }
variable "subnet_ids"         { type = list(string) }
variable "redis_url"          { type = string; sensitive = true }
variable "secret_arns"        { type = map(string); sensitive = true }
variable "elasticache_sg_id"  { type = string; default = null; description = "ElastiCache security group ID — null when using Redis sidecar" }

# ── Cost optimisation flags (derived from environment in main.tf) ─────────────
variable "use_spot" {
  type        = bool
  default     = false
  description = "Use Fargate Spot capacity provider (~70% cheaper, may be interrupted)"
}

variable "use_redis_sidecar" {
  type        = bool
  default     = false
  description = "Run Redis as a sidecar container instead of using ElastiCache"
}

variable "use_ssm" {
  type        = bool
  default     = false
  description = "Secrets sourced from SSM Parameter Store (true) or Secrets Manager (false)"
}
