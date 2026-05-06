output "matches_table_name" {
  value = aws_dynamodb_table.matches.name
}

output "matches_table_arn" {
  value = aws_dynamodb_table.matches.arn
}

output "approval_table_name" {
  value = aws_dynamodb_table.approvals.name
}

output "approval_table_arn" {
  value = aws_dynamodb_table.approvals.arn
}

output "channels_table_name" {
  value = aws_dynamodb_table.channels.name
}

output "channels_table_arn" {
  value = aws_dynamodb_table.channels.arn
}

output "audit_table_name" {
  value = aws_dynamodb_table.auditlog.name
}

output "audit_table_arn" {
  value = aws_dynamodb_table.auditlog.arn
}
