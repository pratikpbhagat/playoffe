output "ecr_repository_url" {
  description = "ECR repository URL — use as DOCKER_REGISTRY in GitHub Actions"
  value       = module.ecr.repository_url
}

output "ecs_cluster_name" {
  description = "ECS cluster name — use in GitHub Actions ECS deploy step"
  value       = module.ecs.cluster_name
}

output "ecs_service_name" {
  description = "ECS service name — use in GitHub Actions ECS deploy step"
  value       = module.ecs.service_name
}

output "redis_endpoint" {
  description = "ElastiCache Redis primary endpoint"
  value       = module.elasticache.primary_endpoint
}

output "cloudfront_domain" {
  description = "CloudFront distribution domain for social-graphics CDN"
  value       = module.cloudfront.domain_name
}

output "secrets_prefix" {
  description = "AWS Secrets Manager path prefix for this environment"
  value       = "/playoffe/${var.environment}"
}
