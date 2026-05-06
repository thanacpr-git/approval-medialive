output "cloudfront_distribution_url" {
  description = "CloudFront URL for the frontend"
  value       = module.s3_cloudfront.cloudfront_url
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID (for cache invalidation)"
  value       = module.s3_cloudfront.cloudfront_distribution_id
}

output "api_gateway_url" {
  description = "API Gateway endpoint URL"
  value       = module.api_gateway.api_url
}

output "cognito_user_pool_id" {
  description = "Cognito User Pool ID"
  value       = module.cognito.user_pool_id
}

output "cognito_client_id" {
  description = "Cognito App Client ID"
  value       = module.cognito.client_id
}

output "cognito_domain" {
  description = "Cognito hosted UI domain"
  value       = module.cognito.domain
}

output "s3_bucket_name" {
  description = "S3 bucket for frontend hosting"
  value       = module.s3_cloudfront.bucket_name
}

output "state_machine_arn" {
  description = "Step Function State Machine ARN"
  value       = module.step_function.state_machine_arn
}
