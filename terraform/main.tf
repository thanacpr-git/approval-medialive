terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket         = "approval-medialive-tfstate"
    key            = "terraform.tfstate"
    region         = "ap-southeast-1"
    dynamodb_table = "terraform-locks"
    encrypt        = true
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "approval-medialive"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

# ==========================================
# Cognito (Authentication)
# ==========================================
module "cognito" {
  source = "./modules/cognito"

  project_name = var.project_name
  environment  = var.environment
  app_url      = var.app_url
}

# ==========================================
# DynamoDB (Data Store)
# ==========================================
module "dynamodb" {
  source = "./modules/dynamodb"

  project_name = var.project_name
  environment  = var.environment
}

# ==========================================
# Lambda Functions
# (Deployed first - Step Function references them)
# ==========================================
module "lambda" {
  source = "./modules/lambda"

  project_name        = var.project_name
  environment         = var.environment
  matches_table_name  = module.dynamodb.matches_table_name
  matches_table_arn   = module.dynamodb.matches_table_arn
  approval_table_name = module.dynamodb.approval_table_name
  approval_table_arn  = module.dynamodb.approval_table_arn
  channels_table_name = module.dynamodb.channels_table_name
  channels_table_arn  = module.dynamodb.channels_table_arn
  state_machine_arn   = module.step_function.state_machine_arn
  audit_table_name    = module.dynamodb.audit_table_name
  audit_table_arn     = module.dynamodb.audit_table_arn
  sender_email        = var.sender_email
  approval_emails     = var.approval_emails
  app_url             = var.app_url
}

# ==========================================
# Step Function (Orchestration)
# (References Lambda ARNs — deployed after Lambda)
# ==========================================
module "step_function" {
  source = "./modules/step-function"

  project_name              = var.project_name
  environment               = var.environment
  send_approval_emails_arn  = module.lambda.send_approval_emails_arn
  stop_channel_function_arn = module.lambda.stop_channel_function_arn
}

# ==========================================
# Update Lambda env vars with Step Function ARN
# (Breaks circular dependency)
# ==========================================
resource "aws_lambda_function_event_invoke_config" "turnoff_sfn" {
  function_name = module.lambda.turnoff_function_name

  depends_on = [module.step_function]
}

# Add Step Function ARN to turnoff Lambda environment
resource "null_resource" "update_turnoff_lambda_env" {
  depends_on = [module.lambda, module.step_function]

  provisioner "local-exec" {
    command = <<-EOT
      aws lambda update-function-configuration \
        --function-name ${module.lambda.turnoff_function_name} \
        --environment "Variables={MATCHES_TABLE=${module.dynamodb.matches_table_name},STATE_MACHINE_ARN=${module.step_function.state_machine_arn},APPROVAL_EMAILS=${var.approval_emails},LOG_GROUP=/approval-medialive/activities}" \
        --region ${var.aws_region} > /dev/null
    EOT
  }

  triggers = {
    state_machine_arn = module.step_function.state_machine_arn
  }
}

# Grant Lambda permission to start Step Function
resource "aws_iam_role_policy" "lambda_sfn_access" {
  name = "step-functions-access"
  role = module.lambda.lambda_role_name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "states:StartExecution",
          "states:SendTaskSuccess",
          "states:SendTaskFailure"
        ]
        Resource = [module.step_function.state_machine_arn]
      }
    ]
  })
}

# ==========================================
# API Gateway
# ==========================================
module "api_gateway" {
  source = "./modules/api-gateway"

  project_name          = var.project_name
  environment           = var.environment
  cognito_user_pool_arn = module.cognito.user_pool_arn
  matches_lambda_arn    = module.lambda.matches_function_arn
  matches_lambda_name   = module.lambda.matches_function_name
  turnoff_lambda_arn    = module.lambda.turnoff_function_arn
  turnoff_lambda_name   = module.lambda.turnoff_function_name
  approval_lambda_arn   = module.lambda.approval_function_arn
  approval_lambda_name  = module.lambda.approval_function_name
}

# ==========================================
# S3 + CloudFront (Frontend Hosting)
# ==========================================
module "s3_cloudfront" {
  source = "./modules/s3-cloudfront"

  project_name = var.project_name
  environment  = var.environment
}
