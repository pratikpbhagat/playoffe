terraform {
  required_version = ">= 1.7.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.50"
    }
  }

  # Remote state — choose ONE backend and uncomment it.
  #
  # Option A: Terraform Cloud (free, recommended for small teams)
  # cloud {
  #   organization = "playoffe"
  #   workspaces {
  #     tags = ["playoffe"]
  #   }
  # }
  #
  # Option B: S3 + DynamoDB (self-hosted)
  # backend "s3" {
  #   bucket         = "playoffe-terraform-state"
  #   key            = "playoffe/${var.environment}/terraform.tfstate"
  #   region         = "ap-southeast-1"
  #   dynamodb_table = "playoffe-terraform-locks"
  #   encrypt        = true
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "playoffe"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}
