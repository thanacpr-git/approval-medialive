# IAM Role for Step Functions
resource "aws_iam_role" "step_function_role" {
  name = "${var.project_name}-sfn-role-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "states.amazonaws.com"
      }
    }]
  })
}

resource "aws_iam_role_policy" "sfn_invoke_lambda" {
  name = "invoke-lambda"
  role = aws_iam_role.step_function_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = ["lambda:InvokeFunction"]
        Resource = [
          var.send_approval_emails_arn,
          "${var.send_approval_emails_arn}:*",
          var.stop_channel_function_arn,
          "${var.stop_channel_function_arn}:*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogDelivery",
          "logs:GetLogDelivery",
          "logs:UpdateLogDelivery",
          "logs:DeleteLogDelivery",
          "logs:ListLogDeliveries",
          "logs:PutLogEvents",
          "logs:PutResourcePolicy",
          "logs:DescribeResourcePolicies",
          "logs:DescribeLogGroups",
          "logs:CreateLogGroup",
          "logs:CreateLogStream"
        ]
        Resource = ["*"]
      }
    ]
  })
}

# Step Function State Machine
resource "aws_sfn_state_machine" "channel_turnoff" {
  name     = "${var.project_name}-channel-turnoff-${var.environment}"
  role_arn = aws_iam_role.step_function_role.arn

  definition = templatefile("${path.module}/../../../step-function/definition.asl.json", {
    SendApprovalEmailsFunctionArn = var.send_approval_emails_arn
    StopChannelFunctionArn        = var.stop_channel_function_arn
  })

  logging_configuration {
    log_destination        = "${aws_cloudwatch_log_group.sfn_logs.arn}:*"
    include_execution_data = true
    level                  = "ALL"
  }

  tags = {
    Name    = "${var.project_name}-channel-turnoff"
    Project = "approval-medialive"
  }
}

resource "aws_cloudwatch_log_group" "sfn_logs" {
  name              = "/aws/vendedlogs/states/${var.project_name}-${var.environment}"
  retention_in_days = 90
}
