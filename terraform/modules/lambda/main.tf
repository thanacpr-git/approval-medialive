# IAM Role for Lambda functions
resource "aws_iam_role" "lambda_role" {
  name = "${var.project_name}-lambda-role-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "lambda.amazonaws.com"
      }
    }]
  })

  tags = {
    Project = "approval-medialive"
  }
}

# Lambda basic execution + CloudWatch logs
resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# DynamoDB access policy
resource "aws_iam_role_policy" "dynamodb_policy" {
  name = "dynamodb-access"
  role = aws_iam_role.lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan"
        ]
        Resource = [
          var.matches_table_arn,
          "${var.matches_table_arn}/index/*",
          var.approval_table_arn,
          "${var.approval_table_arn}/index/*",
          var.channels_table_arn,
          "${var.channels_table_arn}/index/*",
          var.audit_table_arn,
          "${var.audit_table_arn}/index/*"
        ]
      }
    ]
  })
}

# SES access
resource "aws_iam_role_policy" "ses_policy" {
  name = "ses-access"
  role = aws_iam_role.lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["ses:SendEmail", "ses:SendTemplatedEmail"]
        Resource = ["*"]
      }
    ]
  })
}

# MediaLive access (restricted to StopChannel and DescribeChannel)
resource "aws_iam_role_policy" "medialive_policy" {
  name = "medialive-access"
  role = aws_iam_role.lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "medialive:StopChannel",
          "medialive:DescribeChannel",
          "medialive:ListChannels"
        ]
        Resource = [
          "arn:aws:medialive:ap-southeast-1:185906222397:channel:*",
          "arn:aws:medialive:ap-southeast-1:526169475020:channel:*"
        ]
      }
    ]
  })
}

# ---- Lambda Functions ----

# Matches CRUD Lambda
data "archive_file" "matches" {
  type        = "zip"
  source_dir  = "${path.module}/../../../lambda/matches"
  output_path = "${path.module}/builds/matches.zip"
}

resource "aws_lambda_function" "matches" {
  filename         = data.archive_file.matches.output_path
  function_name    = "${var.project_name}-matches-${var.environment}"
  role             = aws_iam_role.lambda_role.arn
  handler          = "index.handler"
  source_code_hash = data.archive_file.matches.output_base64sha256
  runtime          = "nodejs20.x"
  timeout          = 30
  memory_size      = 256

  environment {
    variables = {
      MATCHES_TABLE  = var.matches_table_name
      CHANNELS_TABLE = var.channels_table_name
      AUDIT_TABLE    = var.audit_table_name
    }
  }

  tags = {
    Project = "approval-medialive"
  }
}

# Turn-Off Initiation Lambda
data "archive_file" "turnoff" {
  type        = "zip"
  source_dir  = "${path.module}/../../../lambda/turnoff"
  output_path = "${path.module}/builds/turnoff.zip"
}

resource "aws_lambda_function" "turnoff" {
  filename         = data.archive_file.turnoff.output_path
  function_name    = "${var.project_name}-turnoff-${var.environment}"
  role             = aws_iam_role.lambda_role.arn
  handler          = "index.handler"
  source_code_hash = data.archive_file.turnoff.output_base64sha256
  runtime          = "nodejs20.x"
  timeout          = 30
  memory_size      = 256

  environment {
    variables = {
      MATCHES_TABLE    = var.matches_table_name
      STATE_MACHINE_ARN = var.state_machine_arn
      APPROVAL_EMAILS  = var.approval_emails
      LOG_GROUP        = "/approval-medialive/activities"
      AUDIT_TABLE      = var.audit_table_name
    }
  }
}

# Approval Callback Lambda
data "archive_file" "approval" {
  type        = "zip"
  source_dir  = "${path.module}/../../../lambda/approval"
  output_path = "${path.module}/builds/approval.zip"
}

resource "aws_lambda_function" "approval" {
  filename         = data.archive_file.approval.output_path
  function_name    = "${var.project_name}-approval-${var.environment}"
  role             = aws_iam_role.lambda_role.arn
  handler          = "index.handler"
  source_code_hash = data.archive_file.approval.output_base64sha256
  runtime          = "nodejs20.x"
  timeout          = 30
  memory_size      = 256

  environment {
    variables = {
      APPROVAL_TABLE = var.approval_table_name
      AUDIT_TABLE    = var.audit_table_name
    }
  }

  tags = {
    Project = "approval-medialive"
  }
}

# Send Approval Emails Lambda (called by Step Function)
data "archive_file" "send_approval_emails" {
  type        = "zip"
  source_dir  = "${path.module}/../../../lambda/shared"
  output_path = "${path.module}/builds/sendApprovalEmails.zip"
}

resource "aws_lambda_function" "send_approval_emails" {
  filename         = data.archive_file.send_approval_emails.output_path
  function_name    = "${var.project_name}-send-approval-emails-${var.environment}"
  role             = aws_iam_role.lambda_role.arn
  handler          = "sendApprovalEmails.handler"
  source_code_hash = data.archive_file.send_approval_emails.output_base64sha256
  runtime          = "nodejs20.x"
  timeout          = 60
  memory_size      = 256

  environment {
    variables = {
      APPROVAL_TABLE = var.approval_table_name
      SENDER_EMAIL   = var.sender_email
      APP_URL        = var.app_url
      AUDIT_TABLE    = var.audit_table_name
    }
  }

  tags = {
    Project = "approval-medialive"
  }
}

# Stop Channel Lambda (called by Step Function)
data "archive_file" "medialive" {
  type        = "zip"
  source_dir  = "${path.module}/../../../lambda/medialive"
  output_path = "${path.module}/builds/medialive.zip"
}

resource "aws_lambda_function" "stop_channel" {
  filename         = data.archive_file.medialive.output_path
  function_name    = "${var.project_name}-stop-channel-${var.environment}"
  role             = aws_iam_role.lambda_role.arn
  handler          = "index.handler"
  source_code_hash = data.archive_file.medialive.output_base64sha256
  runtime          = "nodejs20.x"
  timeout          = 120
  memory_size      = 256

  environment {
    variables = {
      MATCHES_TABLE = var.matches_table_name
      SENDER_EMAIL  = var.sender_email
      AUDIT_TABLE   = var.audit_table_name
    }
  }

  tags = {
    Project = "approval-medialive"
  }
}

# CloudWatch Log Group
resource "aws_cloudwatch_log_group" "activities" {
  name              = "/approval-medialive/activities"
  retention_in_days = 90
  tags = { Project = "approval-medialive" }
}

resource "aws_cloudwatch_log_group" "step_function" {
  name              = "/approval-medialive/step-function"
  retention_in_days = 90
  tags = { Project = "approval-medialive" }
}
