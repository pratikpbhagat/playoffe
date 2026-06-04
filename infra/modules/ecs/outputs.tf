output "cluster_name"  { value = aws_ecs_cluster.workers.name }
output "service_name"  { value = aws_ecs_service.workers.name }
output "task_family"   { value = aws_ecs_task_definition.workers.family }
output "log_group"     { value = aws_cloudwatch_log_group.workers.name }
