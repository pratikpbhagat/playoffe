# ── CloudWatch: alarms + dashboard ────────────────────────────────────────────

resource "aws_sns_topic" "alerts" {
  name = "${var.name_prefix}-alerts"
}

resource "aws_sns_topic_subscription" "email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# ── Alarm: Redis queue depth > 100 ───────────────────────────────────────────

resource "aws_cloudwatch_metric_alarm" "queue_depth" {
  alarm_name          = "${var.name_prefix}-queue-depth-high"
  alarm_description   = "Redis queue depth exceeded 100 jobs — workers may be falling behind"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "CurrItems"
  namespace           = "AWS/ElastiCache"
  period              = 60
  statistic           = "Average"
  threshold           = 100
  treat_missing_data  = "notBreaching"

  dimensions = {
    CacheClusterId = var.redis_cluster_id
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
}

# ── Alarm: ECS task stopped unexpectedly ─────────────────────────────────────

resource "aws_cloudwatch_metric_alarm" "running_tasks_low" {
  alarm_name          = "${var.name_prefix}-running-tasks-low"
  alarm_description   = "ECS worker tasks dropped to 0 — service may have crashed"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 2
  metric_name         = "RunningTaskCount"
  namespace           = "ECS/ContainerInsights"
  period              = 60
  statistic           = "Average"
  threshold           = 1
  treat_missing_data  = "breaching"

  dimensions = {
    ClusterName = var.ecs_cluster_name
    ServiceName = var.ecs_service_name
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
}

# ── Alarm: ECS CPU > 80% (sustained) ─────────────────────────────────────────

resource "aws_cloudwatch_metric_alarm" "ecs_cpu_high" {
  alarm_name          = "${var.name_prefix}-ecs-cpu-high"
  alarm_description   = "Worker CPU usage sustained above 80%"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ECS"
  period              = 300
  statistic           = "Average"
  threshold           = 80

  dimensions = {
    ClusterName = var.ecs_cluster_name
    ServiceName = var.ecs_service_name
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
}

# ── Alarm: ECS Memory > 85% ───────────────────────────────────────────────────

resource "aws_cloudwatch_metric_alarm" "ecs_memory_high" {
  alarm_name          = "${var.name_prefix}-ecs-memory-high"
  alarm_description   = "Worker memory usage above 85% — risk of OOM"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "MemoryUtilization"
  namespace           = "AWS/ECS"
  period              = 300
  statistic           = "Average"
  threshold           = 85

  dimensions = {
    ClusterName = var.ecs_cluster_name
    ServiceName = var.ecs_service_name
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
}

# ── Alarm: Social post errors logged (metric filter) ─────────────────────────

resource "aws_cloudwatch_log_metric_filter" "post_errors" {
  name           = "${var.name_prefix}-social-post-errors"
  log_group_name = "/ecs/${var.name_prefix}/workers"
  pattern        = "\"✗\""  # matches the worker error log pattern

  metric_transformation {
    name      = "SocialPostErrors"
    namespace = "Playoffe/${var.environment}"
    value     = "1"
  }
}

resource "aws_cloudwatch_metric_alarm" "post_errors" {
  alarm_name          = "${var.name_prefix}-social-post-errors"
  alarm_description   = "3+ social post failures in 5 minutes"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "SocialPostErrors"
  namespace           = "Playoffe/${var.environment}"
  period              = 300
  statistic           = "Sum"
  threshold           = 3
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.alerts.arn]
}

# ── Dashboard ─────────────────────────────────────────────────────────────────

resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = "${var.name_prefix}-overview"

  dashboard_body = jsonencode({
    widgets = [
      {
        type = "metric"
        properties = {
          title  = "Redis Queue Depth"
          period = 60
          metrics = [["AWS/ElastiCache", "CurrItems", "CacheClusterId", var.redis_cluster_id]]
          view   = "timeSeries"
        }
      },
      {
        type = "metric"
        properties = {
          title  = "ECS Running Tasks"
          period = 60
          metrics = [["ECS/ContainerInsights", "RunningTaskCount", "ClusterName", var.ecs_cluster_name, "ServiceName", var.ecs_service_name]]
          view   = "timeSeries"
        }
      },
      {
        type = "metric"
        properties = {
          title  = "ECS CPU / Memory"
          period = 300
          metrics = [
            ["AWS/ECS", "CPUUtilization",    "ClusterName", var.ecs_cluster_name, "ServiceName", var.ecs_service_name],
            ["AWS/ECS", "MemoryUtilization", "ClusterName", var.ecs_cluster_name, "ServiceName", var.ecs_service_name]
          ]
          view = "timeSeries"
        }
      },
      {
        type = "metric"
        properties = {
          title  = "Social Post Errors (5-min)"
          period = 300
          metrics = [["Playoffe/${var.environment}", "SocialPostErrors"]]
          view   = "singleValue"
        }
      }
    ]
  })
}
