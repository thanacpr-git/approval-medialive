output "matches_function_arn" {
  value = aws_lambda_function.matches.invoke_arn
}

output "matches_function_name" {
  value = aws_lambda_function.matches.function_name
}

output "turnoff_function_arn" {
  value = aws_lambda_function.turnoff.invoke_arn
}

output "turnoff_function_name" {
  value = aws_lambda_function.turnoff.function_name
}

output "approval_function_arn" {
  value = aws_lambda_function.approval.invoke_arn
}

output "approval_function_name" {
  value = aws_lambda_function.approval.function_name
}

output "send_approval_emails_arn" {
  value = aws_lambda_function.send_approval_emails.arn
}

output "stop_channel_function_arn" {
  value = aws_lambda_function.stop_channel.arn
}

output "lambda_role_name" {
  value = aws_iam_role.lambda_role.name
}
