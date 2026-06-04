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
  description = "ElastiCache Redis endpoint (prod only — staging uses Redis sidecar)"
  value       = local.is_prod ? module.elasticache[0].primary_endpoint : "localhost:6379 (sidecar)"
}

output "cloudfront_domain" {
  description = "CloudFront distribution domain for social-graphics CDN"
  value       = module.cloudfront.domain_name
}

output "secrets_path_prefix" {
  description = "Path prefix for secrets in SSM Parameter Store (staging) or Secrets Manager (prod)"
  value       = "/playoffe/${var.environment}"
}

output "cost_mode" {
  description = "Summary of cost optimisations active for this environment"
  value = join(", ", compact([
    local.use_spot          ? "Fargate Spot"    : "Fargate on-demand",
    local.use_redis_sidecar ? "Redis sidecar"   : "ElastiCache",
    local.use_ssm           ? "SSM (free)"      : "Secrets Manager",
  ]))
}
