# ── ECS Fargate: workers service ──────────────────────────────────────────────
#
# Cost flags (set by main.tf locals, derived from environment):
#   use_spot          → Fargate Spot (~70% cheaper, graceful shutdown handles interruptions)
#   use_redis_sidecar → Redis runs as second container; no ElastiCache needed
#   use_ssm           → IAM grants ssm:GetParameters instead of secretsmanager:GetSecretValue

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# ── IAM ───────────────────────────────────────────────────────────────────────

resource "aws_iam_role" "task_execution" {
  name = "${var.name_prefix}-ecs-task-execution"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "task_execution" {
  role       = aws_iam_role.task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# SSM Parameter Store access (staging)
resource "aws_iam_role_policy" "ssm_access" {
  count = var.use_ssm ? 1 : 0
  name  = "${var.name_prefix}-ssm-access"
  role  = aws_iam_role.task_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["ssm:GetParameters", "ssm:GetParameter"]
      Resource = "arn:aws:ssm:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:parameter/playoffe/${var.environment}/*"
    }]
  })
}

# Secrets Manager access (prod)
resource "aws_iam_role_policy" "secrets_access" {
  count = var.use_ssm ? 0 : 1
  name  = "${var.name_prefix}-secrets-access"
  role  = aws_iam_role.task_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue"]
      Resource = values(var.secret_arns)
    }]
  })
}

resource "aws_iam_role" "task" {
  name = "${var.name_prefix}-ecs-task"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

# ── CloudWatch log group ──────────────────────────────────────────────────────

resource "aws_cloudwatch_log_group" "workers" {
  name              = "/ecs/${var.name_prefix}/workers"
  retention_in_days = var.environment == "prod" ? 30 : 7
}

# ── Security group ────────────────────────────────────────────────────────────

resource "aws_security_group" "ecs_tasks" {
  name        = "${var.name_prefix}-ecs-tasks-sg"
  description = "ECS worker tasks"
  vpc_id      = var.vpc_id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "All outbound (Supabase, social APIs, ECR)"
  }
}

# ElastiCache ingress rule — only when NOT using Redis sidecar (prod)
resource "aws_security_group_rule" "ecs_to_redis" {
  count = var.use_redis_sidecar ? 0 : 1

  type                     = "ingress"
  from_port                = 6379
  to_port                  = 6379
  protocol                 = "tcp"
  security_group_id        = var.elasticache_sg_id
  source_security_group_id = aws_security_group.ecs_tasks.id
  description              = "ECS workers → ElastiCache Redis"
}

# ── ECS Cluster ───────────────────────────────────────────────────────────────

resource "aws_ecs_cluster" "workers" {
  name = "${var.name_prefix}-workers"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

# Register Fargate Spot as an available capacity provider on the cluster
resource "aws_ecs_cluster_capacity_providers" "workers" {
  cluster_name       = aws_ecs_cluster.workers.name
  capacity_providers = var.use_spot ? ["FARGATE_SPOT", "FARGATE"] : ["FARGATE"]

  default_capacity_provider_strategy {
    capacity_provider = var.use_spot ? "FARGATE_SPOT" : "FARGATE"
    weight            = 1
  }
}

# ── Task Definition ───────────────────────────────────────────────────────────

locals {
  # Redis sidecar container — only included when use_redis_sidecar = true
  redis_sidecar = var.use_redis_sidecar ? [{
    name      = "redis"
    image     = "redis:7-alpine"
    essential = false  # Worker can still run if Redis briefly restarts

    command = [
      "redis-server",
      "--maxmemory",        "256mb",
      "--maxmemory-policy", "allkeys-lru",
      "--save",             "",          # Disable persistence — fine for staging
    ]

    portMappings = [{ containerPort = 6379, protocol = "tcp" }]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.workers.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "redis"
      }
    }
  }] : []
}

resource "aws_ecs_task_definition" "workers" {
  family                   = "${var.name_prefix}-workers"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.cpu
  memory                   = var.memory
  execution_role_arn       = aws_iam_role.task_execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode(concat(
    [{
      name      = "workers"
      image     = "${var.ecr_repository_url}:${var.image_tag}"
      essential = true

      environment = concat(
        [
          { name = "NODE_ENV",    value = "production" },
          { name = "ENVIRONMENT", value = var.environment },
        ],
        # When using sidecar, REDIS_URL is a plain env var (localhost, not a secret)
        var.use_redis_sidecar ? [{ name = "REDIS_URL", value = "redis://localhost:6379" }] : []
      )

      # Secrets from SSM or Secrets Manager (excludes REDIS_URL when using sidecar)
      secrets = [
        for k, arn in var.secret_arns : {
          name      = k
          valueFrom = arn
        }
      ]

      # When using sidecar, wait for Redis to be ready before starting
      dependsOn = var.use_redis_sidecar ? [{ containerName = "redis", condition = "START" }] : []

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.workers.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "workers"
        }
      }

      healthCheck = {
        # Verify the worker process is alive (exits 0 if Redis is reachable on localhost)
        command     = ["CMD-SHELL", "node -e \"require('net').createConnection(6379,'localhost').on('error',()=>process.exit(1)).on('connect',()=>process.exit(0))\""]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }
    }],
    local.redis_sidecar
  ))
}

# ── ECS Service ───────────────────────────────────────────────────────────────

resource "aws_ecs_service" "workers" {
  name            = "${var.name_prefix}-workers"
  cluster         = aws_ecs_cluster.workers.id
  task_definition = aws_ecs_task_definition.workers.arn
  desired_count   = var.desired_count

  # Spot: use capacity_provider_strategy (launch_type must be null)
  # On-demand: use launch_type = "FARGATE"
  launch_type = var.use_spot ? null : "FARGATE"

  dynamic "capacity_provider_strategy" {
    for_each = var.use_spot ? [1] : []
    content {
      capacity_provider = "FARGATE_SPOT"
      weight            = 1
      base              = 1
    }
  }

  network_configuration {
    subnets          = var.subnet_ids
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip = true
  }

  deployment_minimum_healthy_percent = 50
  deployment_maximum_percent         = 200

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  depends_on = [aws_ecs_cluster_capacity_providers.workers]

  lifecycle {
    ignore_changes = [task_definition]
  }
}

# ── Auto-scaling ──────────────────────────────────────────────────────────────

resource "aws_appautoscaling_target" "workers" {
  max_capacity       = var.environment == "prod" ? 6 : 3
  min_capacity       = 1
  resource_id        = "service/${aws_ecs_cluster.workers.name}/${aws_ecs_service.workers.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "scale_out" {
  name               = "${var.name_prefix}-scale-out"
  policy_type        = "StepScaling"
  resource_id        = aws_appautoscaling_target.workers.resource_id
  scalable_dimension = aws_appautoscaling_target.workers.scalable_dimension
  service_namespace  = aws_appautoscaling_target.workers.service_namespace

  step_scaling_policy_configuration {
    adjustment_type         = "ChangeInCapacity"
    cooldown                = 60
    metric_aggregation_type = "Average"

    step_adjustment {
      metric_interval_lower_bound = 0
      metric_interval_upper_bound = 50
      scaling_adjustment          = 1
    }
    step_adjustment {
      metric_interval_lower_bound = 50
      scaling_adjustment          = 2
    }
  }
}

resource "aws_appautoscaling_policy" "scale_in" {
  name               = "${var.name_prefix}-scale-in"
  policy_type        = "StepScaling"
  resource_id        = aws_appautoscaling_target.workers.resource_id
  scalable_dimension = aws_appautoscaling_target.workers.scalable_dimension
  service_namespace  = aws_appautoscaling_target.workers.service_namespace

  step_scaling_policy_configuration {
    adjustment_type         = "ChangeInCapacity"
    cooldown                = 300
    metric_aggregation_type = "Average"

    step_adjustment {
      metric_interval_upper_bound = 0
      scaling_adjustment          = -1
    }
  }
}
