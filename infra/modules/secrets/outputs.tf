# Unified ARN map — ECS task definition reads these regardless of backend.
# SSM ARN format:              arn:aws:ssm:region:account:parameter/path/KEY
# Secrets Manager ARN format:  arn:aws:secretsmanager:region:account:secret:path/KEY-suffix

locals {
  ssm_arns = {
    for k, v in aws_ssm_parameter.secrets :
    k => "arn:aws:ssm:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:parameter${v.name}"
  }

  sm_arns = {
    for k, v in aws_secretsmanager_secret.secrets :
    k => v.arn
  }
}

output "secret_arns" {
  description = "Map of secret name → ARN for ECS task definition valueFrom"
  value       = var.use_ssm ? local.ssm_arns : local.sm_arns
  sensitive   = true
}

# Only meaningful for prod (Secrets Manager). Returns null for staging.
output "redis_url_secret_id" {
  description = "Secrets Manager secret ID for REDIS_URL — written by main.tf after ElastiCache is ready"
  value       = var.use_ssm ? null : aws_secretsmanager_secret.secrets["REDIS_URL"].id
}
