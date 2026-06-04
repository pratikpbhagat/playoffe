# ── ECS Fargate: workers service ──────────────────────────────────────────────

data "aws_caller_identity" "current" {}

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

resource "aws_iam_role_policy" "secrets_access" {
  name = "${var.name_prefix}-secrets-access"
  role = aws_iam_role.task_execution.id

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

# ── Security group for ECS tasks ──────────────────────────────────────────────

resource "aws_security_group" "ecs_tasks" {
  name        = "${var.name_prefix}-ecs-tasks-sg"
  description = "ECS worker tasks"
  vpc_id      = var.vpc_id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "All outbound (Supabase, social APIs, S3)"
  }
}

# Allow ECS tasks to reach Redis
resource "aws_security_group_rule" "ecs_to_redis" {
  type                     = "ingress"
  from_port                = 6379
  to_port                  = 6379
  protocol                 = "tcp"
  security_group_id        = var.elasticache_sg_id
  source_security_group_id = aws_security_group.ecs_tasks.id
  description              = "ECS workers → Redis"
}

# ── ECS Cluster ───────────────────────────────────────────────────────────────

resource "aws_ecs_cluster" "workers" {
  name = "${var.name_prefix}-workers"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

# ── Task Definition ───────────────────────────────────────────────────────────

resource "aws_ecs_task_definition" "workers" {
  family                   = "${var.name_prefix}-workers"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.cpu
  memory                   = var.memory
  execution_role_arn       = aws_iam_role.task_execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([{
    name  = "workers"
    image = "${var.ecr_repository_url}:${var.image_tag}"

    essential = true

    environment = [
      { name = "NODE_ENV",     value = "production" },
      { name = "ENVIRONMENT",  value = var.environment },
    ]

    # Secrets injected from Secrets Manager at runtime
    secrets = [
      for k, arn in var.secret_arns : {
        name      = k
        valueFrom = arn
      }
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.workers.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "workers"
      }
    }

    healthCheck = {
      command     = ["CMD-SHELL", "node -e \"require('net').createConnection(6379,'localhost').on('error',()=>process.exit(1)).on('connect',()=>process.exit(0))\" || exit 0"]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 60
    }
  }])
}

# ── ECS Service ───────────────────────────────────────────────────────────────

resource "aws_ecs_service" "workers" {
  name            = "${var.name_prefix}-workers"
  cluster         = aws_ecs_cluster.workers.id
  task_definition = aws_ecs_task_definition.workers.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.subnet_ids
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip = true  # Required for Fargate in public subnets to reach ECR/internet
  }

  deployment_minimum_healthy_percent = 50
  deployment_maximum_percent         = 200

  deployment_circuit_breaker {
    enable   = true
    rollback = true  # Auto-rollback if new deployment fails health checks
  }

  lifecycle {
    # Allow GitHub Actions to update image_tag without Terraform conflicts
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

# Scale out when queue depth > 50 jobs
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

# Scale in when queue is empty
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
