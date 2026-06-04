output "primary_endpoint" {
  value = aws_elasticache_cluster.redis.cache_nodes[0].address
}

output "cluster_id" {
  value = aws_elasticache_cluster.redis.id
}

output "security_group_id" {
  value = aws_security_group.redis.id
}
