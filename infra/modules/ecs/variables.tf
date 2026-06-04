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
variable "elasticache_sg_id"  { type = string }
