output "secret_arns" {
  description = "Map of secret name → ARN, passed to ECS task definition"
  value       = { for k, v in aws_secretsmanager_secret.secrets : k => v.arn }
  sensitive   = true
}

output "redis_url_secret_id" {
  description = "Secret ID for REDIS_URL — updated by main.tf after ElastiCache is ready"
  value       = aws_secretsmanager_secret.secrets["REDIS_URL"].id
}
